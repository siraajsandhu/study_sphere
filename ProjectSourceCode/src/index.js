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
  'classes': ['class_name', 'class_desc'],
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
app.get('/', (req, res) => {
  res.render('pages/home');
});

/**
 * REGISTER API ROUTE(S)
 */
app.get('/register', (req, res) => {
  res.render('pages/register');
});

app.post('/register', async (req, res) => {
  // check if username and password are valid. if not, tell user that input was invalid
  const { username, password, confirmPassword } = req.body;

  // username and password should contain valid characters and be properly sized
  const userIsValid = /^[a-zA-Z]+[a-zA-Z0-9_]*$/.test(username) && username.length >= 5;
  const pwdIsValid = /^[a-zA-Z0-9_*]*$/.test(password) && password.length >= 5;
  const pwdMatch = password === confirmPassword;

  if (!(userIsValid && pwdIsValid && pwdMatch)) {
    console.log('ERROR: user entered invalid username and/or password during registration');
    return res.status(400).render('pages/register', {
      error: true,
      message: messages.register_invalidUserOrPwd(),
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
      // if this is a new user, register it
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

app.get('/register/preferences', (req, res) => {
  // only new accounts should select preferences
  if (!req.session.newAccount) {
    return res.redirect('/register');
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

app.get('/profile/update', async (req, res) => {
  if (req.session.user) {
    return res.render('pages/profile_update', {
      user: req.session.user,
    });
  } else {
    res.redirect('/login');
  }
});

app.post('/profile/update', async (req, res) => {
  try {
    if (!req.session.user) {
      res.redirect('/login');
    }

    const { userId, username } = req.session.user;
    const { oldPwd, newPwd, confirmNewPwd } = req.body;
    const profile = await db.one('SELECT * FROM users WHERE user_id = $1', [userId]);
    
    if (!await bcrypt.compare(oldPwd, profile.password)) {
      return res.render('pages/profile_update', {
        user: req.session.user,
        error: true,
        message: messages.profile_pwdMatchFailure(),
      });
    }

    const pwdIsValid = /^[a-zA-Z0-9_*]*$/.test(newPwd) && newPwd.length >= 5;
    const pwdMatch = newPwd === confirmNewPwd;

    if (!(pwdIsValid && pwdMatch)) {
      return res.render('pages/profile_update', {
        user: req.session.user,
        error: true,
        message: messages.profile_invalidPwd(),
      });
    }

    const newHash = await bcrypt.hash(newPwd, 10);
    const query = `UPDATE users SET password = $1 WHERE user_id = $2`;
    await db.any(query, [newHash, userId]);

    return res.render('pages/profile_update', {
      user: req.session.user,
      error: false,
      message: messages.profile_pwdUpdateSuccess(),
    });
  } catch (err) {
    genericFail('pages/profile_update', res, err);
  }
});

app.get('/profile/classes', async (req, res) => {
  try {
    const { username, userId } = req.session.user;
    const classes = await db.any(
`SELECT c.class_name, c.class_desc, c.class_id 
FROM users_to_classes uc 
INNER JOIN classes c ON uc.class_id=c.class_id 
WHERE uc.user_id = $1`, 
      [userId]);

    console.log(classes);

    const params = {
      user: req.session.user,
      classes,
    };

    if (req.query.removed) {
      params.message = messages.profile_deletedClass(req.query.removed);
    }

    return res.render('pages/profile_classes', params);
  } catch(err) {
    genericFail('pages/profile_update', res, err);
  }
});

app.post('/profile/classes', async (req, res) => {
  try {
    const { username, userId } = req.session.user;
    const classId = req.body.classId;
    
    await db.any('DELETE FROM users_to_classes WHERE (user_id=$1 AND class_id=$2)', [userId, classId]);

    return res.redirect(
      `/profile/classes?removed=${req.body.className}`,
    );
  } catch(err) {
    genericFail('pages/profile_classes', res, err);
  }
});

/**
 * CLASSES API ROUTE(S)
 */
app.get('/classes', (req, res) => {
  res.render('pages/classes')
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