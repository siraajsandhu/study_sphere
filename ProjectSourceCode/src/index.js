// import dependencies
const express = require('express');
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const pgp = require('pg-promise')();
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const messages = require('./messages.js');

// connect the database
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
});

// database configuration
const dbConfig = {
  host: 'db', // the database server
  port: 5432, // the database port
  database: process.env.POSTGRES_DB, // the database name
  user: process.env.POSTGRES_USER, // the user account to connect with
  password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

// verify the database
db.connect()
  .then(obj => {
    console.log('Database connection successful'); // you can view this message in the docker compose logs
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });

// register 'hbs' as view engine
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.

// initialize session variables
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
  })
);

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.use('/resources', express.static(path.join(__dirname, 'resources')));

/**
 * UTILITY
 */
function genericFail(route, res, err) {
  return res.status(500).render(route, {
    message: err.message,
    error: true,
  });
}

/**
 * SEARCH API ROUTE(S)
 */
// whitelist tables/fields
const SEARCH_WHITELIST = {
  'classes': ['class_name', 'class_desc', 'class_id'],
};

app.get('/search_util', (req, res) => {
  // general purpose API to search through a table according to some field (e.g. class_name, etc.)
  const { table, field, searchKey = '' } = req.query;
  
  // verify that a search can be made in this particular table/field
  if (table in SEARCH_WHITELIST && SEARCH_WHITELIST[table].includes(field)) {
    const allowableFields = SEARCH_WHITELIST[table].join(',');
    console.log(table, field, searchKey);

    db.task(async t => {
      let results;
      if (searchKey.trim() === '') {
        const query = `SELECT ${allowableFields} FROM ${table}`;
        results = await t.any(query);
      } else {
        const query = `SELECT ${allowableFields} FROM ${table} WHERE LOWER(${field}) LIKE '%${searchKey.toLowerCase()}%'`;
        results = await t.any(query);
      }

      res.status(200).json({
        results,
      });
    }).catch(err => {
      console.log(`/search_util error: ${err.message}`);
      res.status(200).json({results: []});
    });
  } else {  
    res.status(200).json({results: []});
  }
});

/**
 * HOME API ROUTE(S)
 */
app.get('/', async (req, res) => {
  const classes = await db.any('SELECT * FROM classes');
  
  const params = {
    user: req.session.user,
    classes,
    searchMeta: {
      table: 'classes',
      field: 'class_name',
      title: 'Search for classes by course title',
    },
  };

  if (req.query.course_exists) {
    params.error = true;
    params.message = messages.home_courseExists(req.query.course_exists);
  }

  res.render('pages/home', params);
});

app.post('/', async (req, res) => {
  // if (!req.session.user) {
  //   return res.redirect('/login');
  // }

  const { class_dept: dept, class_num: num, class_desc: desc } = req.body;
  const name = dept + num;

  // check if this course exists
  const existingCourse = await db.one(
    `SELECT COUNT(*) FROM classes WHERE LOWER(class_name) = $1`, [name.toLowerCase()],
  );

  if (Number(existingCourse.count) > 0) {
    return res.redirect(
      `/?course_exists=${encodeURIComponent(name)}`,
    )
  } else {
    const {class_id: classId} = await db.one(`INSERT INTO classes (class_name, class_desc) VALUES ($1, $2) RETURNING *`, [name, desc]);
    return res.redirect(`/class/${classId}`);
  }
});

/**
 * REGISTER API ROUTE(S)
 */
app.get('/register', (req, res) => {
  res.render('pages/register', { notRegistered: true });
});

app.post('/register', async (req, res) => {
  // check if username and password are valid. if not, tell user that input was invalid
  const { username, password1, password2 } = req.body;

  if (!/^[a-zA-Z]+[a-zA-Z0-9_]*$/.test(username) ||
    !/^[a-zA-Z0-9_*]*$/.test(password1) ||
    username.length < 5 || password1.length < 5 ||
    password1 !== password2) {
    console.log('ERROR: user entered invalid username and/or password during registration');
    return res.status(400).render('pages/register', {
      error: true,
      message:
        `<div class='container-fluid'>
  <p>Invalid username or password, or passwords do not match</p>
  <p>Usernames and passwords should be at least 5 characters long,
  consisting of:</p>
  <ul>
    <li>lower- and upper-case letters (<kbd>a</kbd>-<kbd>z</kbd>, <kbd>A</kbd>-<kbd>Z</kbd>)</li>
    <li>digits (<kbd>0</kbd>-<kbd>9</kbd>) (usernames can't start with a digit)</li>
    <li>underscores (<kbd>_</kbd>) (usernames can't start with an underscore)</li>
    <li>Passwords may additionally use stars (<kbd>*</kbd>)</li>
  </ul>
</div>`,
      notRegistered: true,
    });
  }

  // if valid, register the account and redirect to preferences
  const hash = await bcrypt.hash(password, 10);

  // but first, check if an account with the username already exists
  db.task(async t => {
    const existingUser = await t.oneOrNone('SELECT COUNT(*) FROM users WHERE username = $1', [username]);

    if (Number(existingUser.count) > 0) {
      console.log('ERROR: this user exists already');
      return res.status(400).render('pages/register', {
        error: true,
        message: messages.register_userExists(username),
      });
    } else {
      const { user_id: userId } = await t.one('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *', [username, hash]);

      // login for user
      req.session.loggedIn = true;
      req.session.user = {
        username,
        userId,
      };
      req.session.newAccount = true; // special flag for selecting preferences
      req.session.save();

      return res.redirect('/register/preferences');
    }
  }).catch(err => genericFail('pages/register', res, err));
});

app.post('/register_preferences', (req, res) => {
  const classes = req.body.class_prefs;
  const names = [];
  if (typeof classes === 'string' || typeof classes === 'number') {
    names.push(`${classes}`);
  } else {
    classes.forEach(name => names.push(name));
    db.task(async function addPrefs(t) {
      if (names.length > 0) {
        const name = names.pop();
        const query1 = `SELECT class_id FROM classes WHERE class_name = $1 LIMIT 1`;
        const query2 = `INSERT INTO users_to_classes (user_id, class_id) VALUES ($1, $2) RETURNING *`;
        const { class_id: classId } = await t.one(query1, [name]);
        await t.one(query2, [req.session.userId, classId]);

        console.log(`added class ${name} (${classId}) to user ${req.session.username} (${req.session.userId})`);
        return addPrefs(t);
      }
    })
      .catch(err => {
        console.log(err);
        res.render('pages/profile', {
          error: true,
          message: err.message,
        });
      });
  }

  delete req.session.newAccount;
  req.session.save();

  return res.render('pages/register_preferences', {
    searchMeta: {
      table: 'classes',
      field: 'class_name',
      title: 'Start by adding classes!',
    }
  });
});

app.post('/register/preferences', (req, res) => {
  if ('class_prefs' in req.body) {
    const classes = req.body.class_prefs;
    const names = [];
    
    if (typeof classes === 'string' || typeof classes === 'number') {
      names.push(`${classes}`);
    } else {
      classes.forEach(name => names.push(name));

      db.task(async function addPrefs(t) {
        if (names.length > 0) {
          const { userId } = req.session.user;

          const name = names.pop();
          const query1 = `SELECT class_id FROM classes WHERE class_name = $1 LIMIT 1`;
          const query2 = `INSERT INTO users_to_classes (user_id, class_id) VALUES ($1, $2) RETURNING *`;
          
          const { class_id: classId } = await t.one(query1, [name]);
          await t.one(query2, [userId, classId]);
          console.log(`added class ${name} (${classId}) to user ${req.session.user.username} (${req.session.user.userId})`);

          return addPrefs(t);
        }
      }).catch(err => genericFail('pages/login', res, err));
    }
  }

  res.redirect('/profile');
});

/**
 * LOGIN API ROUTE(S)
 */
app.get('/login', (req, res) => {
  res.render('pages/login');
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const query = 'SELECT * FROM users WHERE username = $1 LIMIT 1';
    const user = await db.one(query, [username]);
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      req.session.loggedIn = true;
      req.session.user = {
        userId: user.user_id,
        username: user.username,
      };
      
      res.redirect('/profile');
    } else {
      res.status(400).render('pages/login', { 
        error: true,
        message: messages.login_invalidUserOrPwd(),
      });
    }
  } catch (err) {
    res.status(400).render('pages/login', { 
      error: true,
      message: messages.login_invalidUserOrPwd(),
    });
  }
});

/**
 * PROFILE API ROUTE(S)
 */
const auth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next()
}
app.use(auth);

app.get('/profile', (req, res) => {
  res.redirect('/profile/update');
});

//API route for class page
app.get('/classes', async (req, res) => {
  try {
    const classNames = await db.manyOrNone('SELECT class_name FROM classes');
    res.render('pages/classes', {
      classes: classNames.map(row => row.class_name),
      message: null
    })
  } catch (err) { 
    console.log(err);
    res.render('pages/classes', {
      classes: [],
      message: err.message
    });}
});

app.post('/new_question', (req, res) => {
  const { question_name, questions_info, class_id } = req.body;

  const query_questions = `INSERT INTO questions VALUES ($1,$2);`;
  const query_classes = `INSERT INTO classes_to_questions VALUES ($1,$2);`
  const query_asked_question = `INSERT INTO users_to_asked_question VALUES (req.session.user.user_id,$1);`

  const query_id = `SELECT LAST_INSERT_ID();`

  try {
    db.none(query_questions, [question_name, questions_info]);
    const question_id = db.one(query_id);
    db.none(query_classes, [class_id, question_id]);
    db.none(query_asked_question, [question_id])

  } catch (err) {
    console.log(err);
    res.render('pages/classes', {
      classes: classNames.map(row => row.class_name),
      message: err.message
    })
  }
});

app.get('/courses', (req, res) => {
  const questionQ = 'SELECT question_name, question_id FROM questions INNER JOIN classes_to_questions ON question_id = classes_to_questions.question_id  INNER JOIN classes ON classes_to_questions.class_id = class_id GROUP BY question_name';
  db.any(questionQ, [req.session.user])
    .then(questions => {
      console.log(questions)
      res.render('src/views/pages/courses', {
        questions,
      });
    })
    .catch(err => {
      res.render('pages/courses', {
        questions: [],
        error: true,
        message: err.message,
      });
      });
});


app.get('/createClass',(req,res) => {
  const class_name = req.session.class;
  const query="SELECT * from classes WHERE class_name=$1";
  db.task(query,class_name)
    if (query!=NULL){
      res.session="INSERT into classes (class_name) VALUES ($1)";
      /* testing query */
      console.log("successfully added into table");
    }
  document.getElementById("class_name")="";
});

/**
 * LOGOUT API ROUTE(S)
 */
app.get('/logout', (req, res) => {
  if (req.session.user) {
    const oldUser = req.session.user.username;
    req.session.destroy();
    res.render('pages/logout', {oldUser});
  } else {
    res.redirect('/login');
  }
});

/**
 * DUMMY API(S)
 */
app.get('/welcome', (req, res) => {
  res.json({status: 'success', message: 'Welcome!'});
});

// start server
module.exports = app.listen(3000);
console.log('Server listening on port 3000');