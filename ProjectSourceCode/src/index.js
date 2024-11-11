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

// Register API route:
app.get('/register', (req, res) => {
  res.render('pages/register', {notRegistered: true});
});

app.post('/register', async (req, res) => {
  // check if username and password are valid. if not, tell user that input was invalid
  const {username, password1, password2} = req.body;

  if (!/^[a-zA-Z]+[a-zA-Z0-9_]*$/.test(username) || 
      !/^[a-zA-Z0-9_*]*$/.test(password1) ||
      username.length < 5 || password1.length < 5 ||
      password1 !== password2) {
    console.log('ERROR: user entered invalid username and/or password during registration');
    res.render('pages/register', {
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
    return;
  }

  // if username and password are valid, register the user and display user preferences.
  const hash = await bcrypt.hash(req.body.password1, 10);

  // but check if the user already exists or not
  db.task(async t => {
    const existingUser = await t.oneOrNone('SELECT COUNT(*) FROM users WHERE username = $1', [username]);
    if (Number(existingUser.count) > 0) {
      res.render('pages/register', {
        error: true,
        message: `User with name '${username}' already exists. Please choose another username.`,
        notRegistered: true,
      });
    } else {
      const {user_id: userId} = await t.one('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *', [username, hash]);

      // login for user
      req.session.username = username;
      req.session.userId = userId;
      req.session.save();

      const classNames = await t.manyOrNone('SELECT class_name FROM classes');

      res.render('pages/register', {
        notRegistered: false,
        username: req.session.username,
        classes: classNames.map(row => row.class_name),
      });
    }
  })
    .catch(err => {
      console.log(err);
      res.render('pages/register', {
        error: true,
        message: err.message,
      });
    });
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
        const {class_id: classId} = await t.one(query1, [name]);
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
  res.redirect('/profile');
});

//login API route
app.get('/login', (req, res) => {
  res.render('pages/login');
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const query = 'SELECT * FROM users WHERE username = $1;';
    const user = await db.one(query, username);
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.user = { username: user.username, password: user.password };
      req.session.save(error => {
        res.redirect('/login');
      })
      res.redirect('/profile')
    } else {
      res.render('pages/login', { message: 'Invalid username or password' })
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send('Internal Server Error');
  }
});

//API route for profile
app.get('/profile', (req, res) => {
  res.render('pages/profile', {
    username: req.session.username,
    bookmarks: req.session.bookmarks,
    question: req.session.qestion,
    classname: req.session.classname
  })
});

app.get('/classes' ,(req,res)=>{
  res.render('pages/classes')
});

// start server
app.listen(3000);
console.log('Server listening on port 3000');