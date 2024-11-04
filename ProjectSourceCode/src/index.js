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

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

// Register API route:
app.get('/', (req, res) => {
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

// start server
app.listen(3000);
console.log('Server listening on port 3000');