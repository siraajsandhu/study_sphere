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

// Register API route:
app.get('/register', (req, res) => {
  res.render('pages/register')
});


app.post('/register', async (req, res) => {
  //first hash the password given from req
  const hash = await bcrypt.hash(req.body.password, 10);


  var query = 'INSERT INTO users (username, password) VALUES ($1, $2);'
  const username = req.body.username;

  //run the query to enter the username and password into the database
  db.none(query, [
    username,
    hash,
  ])

    //redirect to the login page for now if the query is successful
    //this may to need change to redirect to a classes preference page in the future
    .then(() => {
      res.redirect('/login');
    })


    //redirect back to register page if the query was unsuccessful
    .catch(error => {
      res.redirect('/register');
    })
})

// API routes
app.get('/', (req, res) => {
  // console.log('ASKING FOR HOME');
  hbs.render("src/views/pages/home.hbs",{title:"Title",body:"Body"}).then((renderedHtml) => {
    console.log(renderedHtml);
  });

  res.render('pages/home', {});
  // res.redirect('/login');
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
        res.redirect('/');
      })
      res.redirect('/home')
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

//Search Route
app.get('/search',(req, res) => {
  const userSearch=req.query.search;
  const query = 'SELECT class AS source, from classes where class_name=$1 UNION SELECT question AS source, from questions where question_name=$1 UNION SELECT user AS source from users where username=$1';
  db.task(query,userSearch)
    .then(()=> {

      if (source=='class') {
        
      }

      else if (source =='question'){

      }

      else if (source =='user') {

      }

    }) 

    .catch (err => {
      console.log ("No Results Found");
    }
    )
})

//create class route

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

// start server
app.listen(3000);
console.log('Server listening on port 3000');