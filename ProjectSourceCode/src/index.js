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
    res.status(400).render('pages/register', {
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
      res.status(400).render('pages/register', {
        error: true,
        message: `User with name '${username}' already exists. Please choose another username.`,
        notRegistered: true,
      });
    } else {
      const { user_id: userId } = await t.one('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *', [username, hash]);

      // login for user
      req.session.username = username;
      req.session.userId = userId;
      req.session.save();

      const classNames = await t.any('SELECT class_name FROM classes');

      res.status(201).render('pages/register', {
        notRegistered: false,
        username: req.session.username,
        classes: classNames.map(row => row.class_name),
      });
    }
  })
    .catch(err => {
      console.log(err);
      res.status(500).render('pages/register', {
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
  res.redirect('/profile');
});

//login API route
app.get('/login', (req, res) => {
  res.render('pages/login');
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const query = 'SELECT * FROM users WHERE username = $1';
    const user = await db.one(query, [username]);
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      // req.session.user = { username: user.username, password: user.password };
      req.session.username = user.username;
      req.session.userId = user.user_id;
      req.session.save();
      res.redirect('/profile')
    } else {
      res.status(400).render('pages/login', { message: 'Invalid username or password' })
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send('Internal Server Error');
  }
});

//API route for profile
app.get('/profile', async (req, res) => {
  // console.log('test', req.session.username);
  // return;
  if (req.session.username) {
    db.task(async t => {
      const classes = await t.any('SELECT c.class_name, c.class_desc FROM users_to_classes uc INNER JOIN classes c ON uc.class_id=c.class_id WHERE uc.user_id = $1', [req.session.userId]);
      // const bookmarks = await t.any('SELECT question_id FROM ');
      console.log(classes);

      return { classes };
    })
      .then(data => {
        res.render('pages/profile', {
          username: req.session.username,
          classes: data.classes,
        });
      })
      .catch(err => {
        console.log(err);
        res.redirect('login');
      });
  } else {
    res.redirect('/login');
  }
});

app.post('/profile', async (req, res) => {
  try {
    if (!req.session.username) {
      res.redirect('/login');
    }

    const { oldPwd, newPwd1, newPwd2 } = req.body;
    const profile = await db.one('SELECT * FROM users WHERE user_id = $1', [req.session.userId]);
    const oldHash = await bcrypt.hash(oldPwd, 10);
    const data = await db.any('SELECT c.class_name, c.class_desc FROM users_to_classes uc INNER JOIN classes c ON uc.class_id=c.class_id WHERE uc.user_id = $1', [req.session.userId]);

    console.log(data);
    console.log(oldPwd, oldHash, profile.password);

    if (!await bcrypt.compare(oldPwd, profile.password)) {
      res.render('pages/profile', {
        error: true,
        username: profile.username,
        classes: data,
        message:
  `<div class='container-fluid'>
    <p>Old password does not match current password</p>
  </div>`,
      });
      return;
    }

    if (!/^[a-zA-Z0-9_*]*$/.test(newPwd1) ||
        !/^[a-zA-Z0-9_*]*$/.test(newPwd2) ||
        newPwd1.length < 5 || newPwd2.length < 5 ||
        newPwd1 !== newPwd2) {
      console.log('ERROR: user entered invalid password');
      res.render('pages/profile', {
        error: true,
        classes: data,
        message:
          `<div class='container-fluid'>
    <p>Invalid password</p>
    <p>Passwords should be at least 5 characters long,
    consisting of:</p>
    <ul>
      <li>lower- and upper-case letters (<kbd>a</kbd>-<kbd>z</kbd>, <kbd>A</kbd>-<kbd>Z</kbd>)</li>
      <li>digits (<kbd>0</kbd>-<kbd>9</kbd>) (usernames can't start with a digit)</li>
      <li>underscores (<kbd>_</kbd>)</li>
      <li>stars (<kbd>*</kbd>)</li>
    </ul>
  </div>`,
      });
      return;
    }

    const newHash = await bcrypt.hash(newPwd1, 10);
    const query = `UPDATE users SET password = $1 WHERE user_id = $2`;
    console.log('ID:', req.session.userId);
    await db.any(query, [newHash, req.session.userId]);

    res.render('pages/profile', {
      error: false,
      classes: data,
      message:
`<div class='container-fluid'>
  <p>Password updated successfully</p>
</div>`,
    });
  } catch (err) {
    console.log(err);
  }
});

// app.put('/profile', async (req, res) => {
//   if (req.session.username) {
//     db.task(async t => {
//       // const
//     })
//       .then(data => res.redirect('/profile'))
//       .catch(err => {
//         console.log(err);
//         res.redirect('login');
//       });
//   } else {
//     res.redirect('/login');
//   }
// });

app.get('/classes' ,(req,res)=>{
  res.render('pages/classes')
});

// dummy API for testing
app.get('/welcome', (req, res) => {
  res.json({status: 'success', message: 'Welcome!'});
});

// start server
module.exports = app.listen(3000);
console.log('Server listening on port 3000');