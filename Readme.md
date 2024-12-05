# Study Sphere (Team #7, Rec #012)
### Team name: Study Squad
# Team members: 
- **Vibha Joshi** (*Email: vijo7860@colorado.edu; GitHub: `vijo7860`*)
- **Henry Van Cleave** (*Email: heva2420@colorado.edu; GitHub: `heva2420`*)
- **Diego Castro** (*Email: dica7660@colorado.edu; GitHub: `diego-A-castro`*)
- **Siraaj Sandhu** (*Email: sisa8612@colorado.edu; GitHub: `siraajsandhu`*)
  - *Note from Siraaj: I occasionally contributed on my 2nd account, `saaaji`*
- **Jun Kusano** (*Email: juku2287@colorado.edu; GitHub: `juku2287`*)

# App Description: 
Study Sphere is a homework-help website where students can ask and answer questions
regarding specific topics they are learning in school, or are generally interested in. Questions will generally
be categorized according to course, and if a course does not exist then students are welcome to
create a page for any course they are taking. Each individual question will have its own page,
where users can create new answers and rate existing answers. If time allows, users can
include “steps” in their answers so that anyone seeking the answer must be able to answer
each hint before obtaining the final answer, in order to deter academic dishonesty. Each course
will have its own page, and on each course page is a list of popular questions for that course, a
search feature to find questions related to that course, an option to ask a new question in that
course, and a live chat where students can carry out free form discussion on course content.
Courses will be accessible through the home page, which will have a search feature for courses
and a list of popular courses based on user activity. Users can additionally add courses to their
profile for easy access. Images can be embedded in questions and users can link helpful videos that answer a particular question. Users can also bookmark questions and revisit them later on by
viewing their profile. For convenience, a guest mode will be implemented so that users need not
be logged in to view course and question content, though if they wish to interact with any
features that require knowledge of the user’s identity, such as asking, answering, or
bookmarking questions, they will be directed to either register an account or log in.

*Vision Statement*: For students who are struggling with their classes, the Study Sphere is a homework-help website that builds a community of students taking similar courses who can help each other with questions. The ultimate goal is to help students foster a deeper understanding of their coursework.

# Technology Stack
The planned tech stack will include Docker containers, PostgreSQL, bootstrap, node.js, handlebars.js, 
express.js, and pg-promise for node, among others.
Our technology stack can be summarized as follows:
- **Frontend**
  - *HTML* to structure pages
  - *Handlebars.js* to implement templated HTML pages
  - *CSS* to add custom styling
  - *JavaScript* to implement custom functionality, e.g. search bars & answer voting
  - *Bootstrap* to easily style content of site at large scale
  - *SASS/SCSS* to implement custom Bootstrap theme (using the `bootstrap-scss` node module)
- **Backend**
  - *Node.js* JavaScript runtime to run our server
  - *Express.js* to use as our framework for API endpoints
  - `multer` node module to process multipart form data and store transient uploaded images locally
  - `bcrypt` to generate hashes for passwords
  - `express-session` node module to support session management and user authentication via cookies
- **Database**
  - *PostgreSQL* database to store user, class, question, & answer information.
    - Used SQL queries to interact with database
    - `pg-promise` node module to submit queries to our PostgreSQL database
  - *Amazon Web Services (AWS) Simple-Storage-Service (S3)* for cloud storage
    - Created a "bucket" on the S3 free tier to store arbitrary files and data
    - `aws-sdk` node module to interact with our bucket from our app
- **Local Instance & Deployment**
  - *Docker* containers for local development
  - *Render* for deployment
    - Deployment link: [https://study-sphere-res6.onrender.com/]()   
- **Project Management**
  - *Lucidchart* for use-case / architecture diagrams
  - *GitHub Project Board* to organize tasks according to AGILE methodology
- **Version Control**
  - *GitHub* repository to support version control through branches & pull requests 
- **Testing**
  - *Mocha* & *Chai* node modules to test different endpoints of our app


# Prerequisite Software
If you want to run this app locally, you will need Docker to run the container. This container should handle installation of node modules automatically. Most node modules used are documented in **Technology Stack**.
This container should also automatically support use of the PostgreSQL database. Other than this no other software should be required to run the application. Instructions are available in the next section.

# Instructions
These are instructions for running the app locally. 
You will need to install Docker since local instantiation relies on a container. 
It is also crucial that you create a `.env` file with the following fields:
- `POSTGRES_USER="postgres"`
- `POSTGRES_PASSWORD="pwd"`
- `POSTGRES_DB="users_db"`
- `POSTGRES_HOST="db"`
- `POSTGRES_PORT=5432`
- `AWS_ACCESS_KEY_ID=<*insert access key*>`
- `AWS_SECRET_ACCESS_KEY=<*insert secret access key*>`
- `SESSION_SECRET="super duper secret!"`

For obvious reasons you will need to supply your own AWS access keys because we must keep the ones we use for development private. When this `.env` file is created,
it should be possible to start the docker container without error, for instance by running `sudo docker compose up` and `sudo docker compose down ('-v' if needed)` to terminate it and clear its volumes if necessary. The app should then be available at `localhost:3000`. You are then free to navigate the app.

# Tests
We run unit tests on different endpoints using the *Mocha* and *Chai* node modules.
To run the tests, it is necessary to modify `docker-compose.yaml` in 
`/ProjectSourceCode`. There is a field under the 
`web` service called command that is typically formatted as such:
- `command: npm start`

To run the tests, change this command to:
- `command: npm run testandrun`

Starting the container after this should run the unit tests. If you run the container with `sudo docker compose up` the results should be viewable in the terminal

# General Directory Structure
We use the following directory structure:
- *`MilestoneSubmissions`*
- *`TeamMeetingLogs`*
- *`ProjectSourceCode`*
  - `|__ src`
    - *`|__ init_data`* 
    - *`|__ resources`*
    - *`|__ test`*
    - *`|__ views`*
    - `|__ index.js`
  - `|__ docker-compose.yaml`
  - `|__ package.json`
  - `|__ .gitignore`
- `Readme.md`

# Link to App
The app has been deployed using *Render* and is available at the following link: 
(https://study-sphere-res6.onrender.com)
