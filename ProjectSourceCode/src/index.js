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
const aws = require('aws-sdk');
const fs = require('fs');
const multer = require('multer');
const uuid = require('uuid');
const sass = require('sass');

// compile Sass
const compCss = sass.compile('./src/resources/scss/style.scss');
fs.writeFileSync('./src/resources/css/style.css', compCss.css);
console.log('COMPILED SCSS');







// basic storage for messages
const MESSAGE_STORE = new Map();
const BUCKET_NAME = 'studyspherebucket';
const IMAGE_CACHE_DIR = './image_cache';
const MULTER_CACHE_DIR = './multer_cache';

// initialize image cache directories
if (!fs.existsSync(MULTER_CACHE_DIR)) {
  fs.mkdirSync(MULTER_CACHE_DIR);
}

if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR);
}

// configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, IMAGE_CACHE_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({storage});

// configure AWS
aws.config.update({ region: 'us-east-2' });
const s3 = new aws.S3();

// list existing buckets
s3.listBuckets((e, d) => {
  if (!e) {
    console.log(d.Buckets);
  } else {
    console.log(e);
  }
});

// connect the database
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
});

// database configuration
const dbConfig = {
  host: process.env.POSTGRES_HOST, // the database server
  port: process.env.POSTGRES_PORT, // the database port
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
 * IMAGE ROUTE(S)
 */
async function getCachedImage(key) {
  const imagePath = path.join(IMAGE_CACHE_DIR, key);
  if (fs.existsSync(imagePath)) {
    console.log(`SERVING CACHED IMAGE '${imagePath}'`);
    return imagePath;
  } else {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
    };

    try {
      const data = await s3.getObject(params).promise();
      fs.writeFileSync(imagePath, data.Body);
      console.log(`FETCHING & CACHING IMAGE '${imagePath}'`);
      return imagePath;
    } catch (e) {
      throw e;
    }
  }
}

app.get('/image/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const imagePath = await getCachedImage(key);
    res.sendFile(imagePath, { root: '.' });
  } catch (e) {
    res.status(500).send('Error finding image');
  }
});

/**
 * SEARCH API ROUTE(S)
 */
// whitelist tables/fields
const SEARCH_WHITELIST = {
  'classes': ['class_name', 'class_desc', 'class_id'],
  'questions': ['question_title', 'question_content', 'question_id', 'question_date'],
};

app.get('/search_util', (req, res) => {
  // general purpose API to search through a table according to some field (e.g. class_name, etc.)
  const { table, field, searchKey = '', optClass = null } = req.query;
  
  // verify that a search can be made in this particular table/field
  if (table in SEARCH_WHITELIST && SEARCH_WHITELIST[table].includes(field)) {
    const allowableFields = SEARCH_WHITELIST[table].map(s => `q.${s}`).join(',');
    console.log(table, field, searchKey);

    db.task(async t => {
      let results, query;
      if (searchKey.trim() === '') {
        query = `SELECT ${allowableFields} FROM ${table} q`;
        if (optClass) {
          query += ` JOIN classes_to_questions qc ON q.question_id = qc.question_id WHERE qc.class_id = ${Number(optClass)}`;
        }
      } else {
        query = `SELECT ${allowableFields} FROM ${table} q WHERE LOWER(q.${field}) LIKE '%${searchKey.toLowerCase()}%'`;
        if (optClass) {
          query = 
`SELECT ${allowableFields} 
 FROM ${table} q 
 JOIN classes_to_questions qc
 ON q.question_id = qc.question_id 
 WHERE LOWER(${field}) LIKE '%${searchKey.toLowerCase()}%' AND qc.class_id = ${Number(optClass)}`;
        }
      }
      
      results = await t.any(query);
      console.log(results);
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
  res.redirect('/find');
});

app.get('/find', async (req, res) => {
  // exclude joined classes from the list of popular classes
  let classes;
  if (req.session.user) {
    classes = await db.any(
`SELECT c.class_id, c.class_name, c.class_desc 
FROM classes c 
LEFT JOIN users_to_classes uc 
ON c.class_id = uc.class_id 
AND uc.user_id = $1 
WHERE uc.user_id IS NULL`, 
      [req.session.user.userId]);
  } else {
    classes = await db.any('SELECT * FROM classes');
  }

  const params = {
    user: req.session.user,
    classes,
    searchMeta: {
      table: 'classes',
      field: 'class_name',
      title: 'Search for classes by course title',
      placeholder: 'Search by course name',
    },
  };

  if (req.query.added) {
    params.message = messages.home_joinedClass(req.query.added);
    params.error = false;
  }

  res.render('pages/home_find', params);
});

app.post('/find', async (req, res) => {
  if (!req.session.user) {
    // shouldn't happen
    return res.redirect('/login');
  }

  const { className, classId } = req.body;
  await db.one(
    'INSERT INTO users_to_classes (user_id, class_id) VALUES ($1, $2) RETURNING *',
    [req.session.user.userId, Number(classId)]
  );

  res.redirect(`/find?added=${encodeURIComponent(className)}`);
});

app.get('/create', async (req, res) => {
  if (!req.session.user) {
    res.redirect(
      `/login?needs_account=${encodeURIComponent(messages.home_needsAccountToCreate())}`)
  }

  const params = {
    user: req.session.user,
  };
  
  if (req.query.course_exists) {
    params.error = true;
    params.message = messages.home_courseExists(req.query.course_exists);
  }

  res.render('pages/home_create', params);
});

app.post('/create', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  const { class_dept: dept, class_num: num, class_desc: desc } = req.body;
  const name = dept + num;

  // check if this course exists
  const existingCourse = await db.one(
    `SELECT COUNT(*) FROM classes WHERE LOWER(class_name) = $1`, [name.toLowerCase()],
  );

  if (Number(existingCourse.count) > 0) {
    return res.redirect(
      `/create?course_exists=${encodeURIComponent(name)}`,
    )
  } else {
    const {class_id: classId} = await db.one(`INSERT INTO classes (class_name, class_desc) VALUES ($1, $2) RETURNING *`, [name, desc]);
    return res.redirect(`/class/${classId}`);
  }
});

/**
 * CLASS API ROUTE(S)
 */
app.get('/class/:classId', (req, res) => {
  const { classId } = req.params;
  res.redirect(`/class/${classId}/find`);
});

app.get('/class/:classId/find', async (req, res) => {
  const { classId } = req.params;
  const classExists = await db.any('SELECT * FROM classes WHERE class_id = $1', [classId]);

  if (classExists.length > 0) {
    const [row] = classExists;
    const questions = await db.any(
`SELECT q.question_id, q.question_title, q.question_content, q.question_date 
 FROM questions q 
 JOIN classes_to_questions qc 
 ON q.question_id = qc.question_id 
 WHERE qc.class_id = $1
 ORDER BY q.question_date DESC`, [classId]);

    const additionalParams = {};
    if (req.query.asked) {
      additionalParams.message = messages.class_askedQuestion();
      additionalParams.error = false;
    }

    if (req.query.needs_account) {
      additionalParams.message = messages.class_needsAccountToAsk();
      additionalParams.error = true;
    }

    if (req.query.left) {
      additionalParams.message = messages.class_left();
      additionalParams.error = false;
    }

    if (req.query.joined) {
      additionalParams.message = messages.class_joined();
      additionalParams.error = false;
    }

    if (req.query.needs_account_chat) {
      additionalParams.message = messages.class_needsAccountChat();
      additionalParams.error = true;
    }

    // check if joined
    if (req.session.user) {
      const {count} = await db.one(
        'SELECT COUNT(*) FROM classes c JOIN users_to_classes uc ON c.class_id = uc.class_id WHERE c.class_id = $1 AND uc.user_id = $2',
        [classId, req.session.user.userId],
      );
      
      if (Number(count) > 0) {
        additionalParams.joined = true;
      }
    }

    res.render('pages/class_find', {
      user: req.session.user,
      searchMeta: {
        table: 'questions',
        field: 'question_content',
        title: 'Search for questions by content',
        optClass: classId,
        placeholder: 'Search by question content',
      },
      classInfo: {
        name: row.class_name,
        desc: row.class_desc,
        id: classId,
      },
      questions: questions.map(({question_id, question_title, question_content, question_date}) => { 
        const d = new Date(question_date);

        return {
          question_id,
          question_title,
          question_content,
          question_date: `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDay().toString().padStart(2, '0')}-${d.getFullYear()}`,
        };
      }),
      ...additionalParams,
    });
  } else {
    // if the class doesn't exist, just redirect to the home page for now
    res.redirect('/');
  }
});

app.post('/class/:classId/find', async (req, res) => {
  const { classId } = req.params;
  const classExists = await db.any('SELECT * FROM classes WHERE class_id = $1', [classId]);

  if (classExists.length > 0 && req.session.user) {
    const [row] = classExists;
    const {count} = await db.one(
      'SELECT COUNT(*) FROM classes c JOIN users_to_classes uc ON c.class_id = uc.class_id WHERE c.class_id = $1 AND uc.user_id = $2',
      [classId, req.session.user.userId],
    );
    
    let uriComp;
    if (Number(count) > 0) {
      // leave
      uriComp = `left=true`;
      await db.any('DELETE FROM users_to_classes WHERE (user_id=$1 AND class_id=$2)', [req.session.user.userId, classId]);
    } else {
      // join
      uriComp = `joined=true`;
      await db.any('INSERT INTO users_to_classes (user_id, class_id) VALUES ($1, $2)', [req.session.user.userId, classId]);
    }

    res.redirect(`/class/${classId}/find?${uriComp}`);
  } else {
    // if the class doesn't exist, just redirect to the home page for now
    res.redirect('/');
  }
});

app.get('/class/:classId/ask', async (req, res) => {
  const { classId } = req.params;
  const classExists = await db.any('SELECT * FROM classes WHERE class_id = $1', [classId]);

  // needs account to ask question
  if (!req.session.user) {
    res.redirect(`/class/${classId}/find?needs_account=true`);
  }

  // check if joined
  const additionalParams = {};
  if (req.session.user) {
    const {count} = await db.one(
      'SELECT COUNT(*) FROM classes c JOIN users_to_classes uc ON c.class_id = uc.class_id WHERE c.class_id = $1 AND uc.user_id = $2',
      [classId, req.session.user.userId],
    );
    
    if (Number(count) > 0) {
      additionalParams.joined = true;
    }
  }

  if (classExists.length > 0) {
    const [row] = classExists;
    res.render('pages/class_ask', {
      user: req.session.user,
      classInfo: {
        name: row.class_name,
        desc: row.class_desc,
        id: classId,
      },
      ...additionalParams,
    });
  } else {
    // if the class doesn't exist, just redirect to the home page for now
    res.redirect('/');
  }
});

app.post('/class/:classId/ask', upload.array('images'), async (req, res) => {
  const { classId } = req.params;
  const classExists = await db.any('SELECT * FROM classes WHERE class_id = $1', [classId]);

  if (!req.session.user) {
    res.redirect(`/class/${classId}/find?needs_account=true`);
  }

  if (classExists.length > 0) {
    const [row] = classExists;
    const { title, content } = req.body;

    console.log(title, content);
    
    // upload images to AWS if necessary
    db.task(async t => {
      const { question_id: questionId } = await t.one(
        'INSERT INTO questions (question_title, question_content, question_date) VALUES ($1, $2, CURRENT_DATE) RETURNING *', 
        [title, content],
      );

      for (let i = 0; i < req.files.length; i++) {
        const meta = req.files[i];

        // generate key for object using UUID
        const key = `q${questionId.toString().padStart(3,'0')}i${i.toString().padStart(3,'0')}_${uuid.v4()}.png`;
        const body = fs.readFileSync(meta.path);

        const params = {
          Bucket: BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: meta.mimetype,
        };

        console.log(params);

        await s3.putObject(params).promise();
        const { image_id: imageId } = await t.one(
          'INSERT INTO images (image_key) VALUES ($1) RETURNING *', 
          [key],
        );
        await t.one(
          'INSERT INTO questions_to_images (question_id, image_id) VALUES ($1, $2) RETURNING *', 
          [questionId, imageId],
        );

        console.log(`HANDLING IMAGE: ${meta.originalname} -> ${key}`);

        // discard image
        fs.unlinkSync(meta.path);
      }

      // link to class and user
      await t.one(
        'INSERT INTO classes_to_questions (class_id, question_id) VALUES ($1, $2) RETURNING *',
        [classId, questionId],
      );

      return t.one(
        'INSERT INTO users_to_asked_questions (user_id, question_id) VALUES ($1, $2) RETURNING *',
        [req.session.user.userId, questionId],
      );

      console.log('inserted row__', req.session.user.userId, questionId);
    }).then(() => {
      res.redirect(`/class/${classId}/find?asked=true`);
    }).catch(e => {
      // for failure just redirect to class page
      console.log(e);
      res.redirect(`/class/${classId}/find`);
    });
  } else {
    // if the class doesn't exist, just redirect to the home page for now
    res.redirect('/');
  }
});

app.get('/class/:classId/chat', async (req, res) => {
  const { classId } = req.params;
  if (!req.session.user) {
    return res.redirect(`/class/${classId}/find?needs_account_chat=true`);
  }

  const classExists = await db.any('SELECT * FROM classes WHERE class_id = $1', [classId]);
  if (classExists.length > 0) {
    const [row] = classExists;
    res.render('pages/class_chat', {
      user: req.session.user,
      classInfo: {
        name: row.class_name,
        id: row.class_id,
        desc: row.class_desc,
      },
    });
  } else {
    res.redirect('/');
  }
});

app.post('/class/:classId/chat/messages', (req, res) => {
  const { username, message, date } = req.body;
  const { classId } = req.params;
  if (!MESSAGE_STORE.has(classId)) {
    MESSAGE_STORE.set(classId, []);
  }

  const backlog = MESSAGE_STORE.get(classId);
  backlog.unshift({ username, message, date });

  if (backlog.length > 20) {
    backlog.length = 20;
  }
});

app.get('/class/:classId/chat/messages', (req, res) => {
  try {
    console.log('GOT REQ');

    const { since } = req.query;
    const { classId } = req.params;
    
    if (MESSAGE_STORE.has(classId)) {
      const backlog = MESSAGE_STORE.get(classId);
      console.log(backlog.filter(({date}) => date > Number(since)));
      res.status(200).json({
        messages: backlog.filter(({date}) => date > Number(since)),
      });
    } else {
      res.status(200).json({ messages: [] });
    }
  } catch(e) {
    console.log('ERROR', e);
    res.status(200).json({messages: []});
  }
});

/**
 * QUESTION API ROUTE(S)
 */
app.get('/question/:questionId', async (req, res) => {
  // check if question exists
  const { questionId } = req.params;
  const questionExists = await db.any('SELECT * FROM questions WHERE question_id = $1', [questionId]);
  if (questionExists.length > 0) {
    const [question] = questionExists;
    const d = new Date(question.question_date);

    db.task(async t => {
      // get user who asked
      const parentUser = await t.one(
        'SELECT u.username FROM questions q JOIN users_to_asked_questions uq ON q.question_id = uq.question_id JOIN users u ON uq.user_id = u.user_id WHERE q.question_id = $1',
        [questionId],
      );

      // get parent class
      const parentClass = await t.one(
        'SELECT c.class_id, c.class_name FROM classes c JOIN classes_to_questions cq ON c.class_id = cq.class_id WHERE cq.question_id = $1',
        [questionId],
      );

      const images = await t.any(
        'SELECT i.image_key FROM questions q JOIN questions_to_images qi ON q.question_id = qi.question_id JOIN images i ON i.image_id = qi.image_id WHERE q.question_id = $1',
        [questionId],
      );

      const additionalParams = {};

      const answers = await t.any(
`SELECT * 
 FROM answers a 
 JOIN questions_to_answers qa 
 ON a.answer_id = qa.answer_id  
 WHERE qa.question_id = $1`,
        [questionId],
      );

      for (let i = 0; i < answers.length; i++) {
        const {answer_id: answerId} = answers[i];
        // attach user and image info
        const {username} = await t.one(
          'SELECT u.username FROM users u JOIN users_to_answers ua ON u.user_id = ua.user_id WHERE ua.answer_id = $1',
          [answerId]
        );

        const images = await t.any(
          'SELECT i.image_key FROM images i JOIN answers_to_images ai ON i.image_id = ai.image_id WHERE ai.answer_id = $1',
          [answerId],
        );

        answers[i].username = username;
        answers[i].images = images;

        if (req.session.user) {
          const entry = await t.any(
            'SELECT * FROM answers_like_status WHERE answer_id = $1 AND user_id = $2', [answerId, req.session.user.userId],
          );

          if (entry.length) {
            const {like_status: likeStatus} = entry[0];
            answers[i].liked = likeStatus > 0;
            answers[i].disliked = likeStatus < 0;
            answers[i].likeStatus = likeStatus;
          }
        }

        const numPoints = await t.one('SELECT SUM(like_status) FROM answers_like_status WHERE answer_id = $1', answerId);
        answers[i].numPoints = Number(numPoints.sum); // null becomes zero if no likes/dislikes have been assigned yet
        answers[i].pluralPoints = Math.abs(answers[i].numPoints) !== 1;

        const d = new Date(answers[i].answer_date);
        answers[i].answer_date = `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDay().toString().padStart(2, '0')}-${d.getFullYear()}`;
      }

      // console.log(answers);
      answers.sort((a1, a2) => a2.numPoints - a1.numPoints);
      console.log(answers);

      // check if bookmarked or not
      additionalParams.bookmarked = false;
      if (req.session.user) {
        const bookmarkExists = await t.any('SELECT * FROM users_to_bookmarks WHERE user_id = $1 AND question_id = $2', [req.session.user.userId, questionId]);
        if (bookmarkExists.length > 0) {
          additionalParams.bookmarked = true;
        }
      }

      res.render('pages/question', {
        user: req.session.user,
        questionInfo: {
          id: questionId,
          title: question.question_title,
          content: question.question_content,
          date: `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDay().toString().padStart(2, '0')}-${d.getFullYear()}`,
        },
        parentUser: {
          name: parentUser.username,
        },
        classInfo: {
          id: parentClass.class_id,
          name: parentClass.class_name,
        },
        answers,
        images,
        ...additionalParams,
      });
    }).catch(e => {
      console.log(e);
      res.redirect('/')
    });
  } else {
    res.redirect('/');
  }
});

// posting a new answer
app.post('/question/:questionId/new_answer', upload.array('images'), async (req, res) => {
  const { questionId } = req.params;
  const questionExists = await db.any('SELECT * FROM questions WHERE question_id = $1', [questionId]);

  if (!req.session.user) {
    res.redirect(`/question/${questionId}`);
  }

  if (questionExists.length > 0) {
    const [row] = questionExists;
    const { content } = req.body;

    // upload images to AWS if necessary
    db.task(async t => {
      const { answer_id: answerId } = await t.one(
        'INSERT INTO answers (answer_content, answer_date) VALUES ($1, CURRENT_DATE) RETURNING *', 
        [content],
      );

      for (let i = 0; i < req.files.length; i++) {
        const meta = req.files[i];
        const ext = meta.mimetype.split('/').at(-1).toLowerCase();

        // generate key for object using UUID
        const key = `a${answerId.toString().padStart(3,'0')}i${i.toString().padStart(3,'0')}_${uuid.v4()}.${ext}`;
        const body = fs.readFileSync(meta.path);

        const params = {
          Bucket: BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: meta.mimetype,
        };

        console.log(params);

        await s3.putObject(params).promise();
        const { image_id: imageId } = await t.one(
          'INSERT INTO images (image_key) VALUES ($1) RETURNING *', 
          [key],
        );
        await t.one(
          'INSERT INTO answers_to_images (answer_id, image_id) VALUES ($1, $2) RETURNING *', 
          [answerId, imageId],
        );

        console.log(`HANDLING IMAGE: ${meta.originalname} -> ${key}`);

        // discard image
        fs.unlinkSync(meta.path);
      }

      // link to class and user
      await t.one(
        'INSERT INTO questions_to_answers (question_id, answer_id) VALUES ($1, $2) RETURNING *',
        [questionId, answerId],
      );

      return t.one(
        'INSERT INTO users_to_answers (user_id, answer_id) VALUES ($1, $2) RETURNING *',
        [req.session.user.userId, answerId],
      );
    }).then(() => {
      res.redirect(`/question/${questionId}`);
    }).catch(e => {
      // for failure just redirect to class page
      console.log(e);
      res.redirect(`/question/${questionId}`);
    });
  } else {
    // if the question doesn't exist, just redirect to the home page for now
    res.redirect('/');
  }
});

/**
 * BOOKMARK API ROUTE(S)
 */
app.post('/question/:questionId/bookmark', async (req, res) => {
  if (!req.session.user) {
    return;
  }

  const { questionId } = req.params;
  const questionExists = await db.any('SELECT * FROM questions WHERE question_id = $1', [questionId]);

  if (questionExists.length > 0) {
    db.task(async t => {
      const bookmarkExists = await t.any('SELECT * FROM users_to_bookmarks WHERE user_id = $1 AND question_id = $2', [req.session.user.userId, questionId]);
      if (bookmarkExists.length > 0) {
        // if the bookmark exists, remove it
        return t.any('DELETE FROM users_to_bookmarks WHERE user_id = $1 AND question_id = $2', [req.session.user.userId, questionId]);
      } else {
        // if the bookmark doesn't exist, add it
        return t.any('INSERT INTO users_to_bookmarks (user_id, question_id) VALUES ($1, $2)', [req.session.user.userId, questionId]);
      }
    }).then(() => {
      res.redirect(`/question/${questionId}`);
    }).catch(e => {
      console.log(e);
      res.redirect(`/question/${questionId}`);
    });
  }
});

/**
 * VOTE API ROUTE(S)
 */
app.post('/vote', async (req, res) => {
  const { likeStatus, userId = -1, answerId = -1 } = req.body;

  if (!req.session.user) {
    return;
  }

  // // check if entry, user, and answer already exist
  db.task(async t => {
    const answerExists = await t.any('SELECT * FROM answers WHERE answer_id = $1', answerId);
    const userExists = await t.any('SELECT * FROM users WHERE user_id = $1', userId);
    const entryExists = await t.any('SELECT * FROM answers_like_status WHERE answer_id = $1 AND user_id = $2', [answerId, userId]);

    if (answerExists.length > 0 && userExists.length > 0 && Math.abs(likeStatus) <= 1) {
      // if the entry doesn't exist, make it first. otherwise, update it
      if (entryExists.length > 0) {
        await t.any('UPDATE answers_like_status SET like_status = $1 WHERE answer_id = $2 AND user_id = $3', [likeStatus, answerId, userId]);
      } else {
        await t.any('INSERT INTO answers_like_status (answer_id, user_id, like_status) VALUES ($1, $2, $3)', [answerId, userId, likeStatus]);
      }
    }
  }).catch(e => console.log(e));
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
    user: req.session.user,
    searchMeta: {
      table: 'classes',
      field: 'class_name',
      title: 'Start by adding classes!',
      placeholder: 'Search by course name',
    }
  });
});

app.post('/register/preferences', (req, res) => {
  if ('class_prefs' in req.body) {
    const classes = req.body.class_prefs;
    const names = [];

    console.log(classes);
    
    if (typeof classes === 'string' || typeof classes === 'number') {
      names.push(classes);
    } else {
      classes.forEach(name => names.push(name));
    }

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

  res.redirect('/profile');
});

/**
 * LOGIN API ROUTE(S)
 */
app.get('/login', (req, res) => {
  const additionalParams = {};
  if (req.query.needs_account) {
    additionalParams.message = req.query.needs_account;
    additionalParams.error = true;
  }

  res.render('pages/login', {
    ...additionalParams,
  });
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const query = 'SELECT * FROM users WHERE username = $1 LIMIT 1';
    const user = await db.one(query, [username]);
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      req.session.loggedIn = true;
      console.log('USER', user);
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

app.get('/profile/asked', async (req, res) => {
  if (!req.session.user) {
    res.redirect('/login');
  }

  const asked = await db.any(
`SELECT q.question_id, q.question_title, q.question_content, q.question_date, c.class_name, c.class_id
 FROM questions q 
 JOIN users_to_asked_questions uq 
 ON uq.question_id = q.question_id 
 JOIN classes_to_questions cq
 ON cq.question_id = q.question_id
 JOIN classes c
 ON cq.class_id = c.class_id
 WHERE uq.user_id = $1`,
    [req.session.user.userId],
  );

  console.log(asked);

  res.render('pages/profile_asked', {
    user: req.session.user,
    questions: asked,
  });
});

app.get('/profile/bookmarks', async (req, res) => {
  if (!req.session.user) {
    res.redirect('/login');
  }

  const bookmarks = await db.any(
`SELECT q.question_id, q.question_title, q.question_content, q.question_date, c.class_name, c.class_id
 FROM questions q 
 JOIN users_to_bookmarks ub 
 ON ub.question_id = q.question_id 
 JOIN classes_to_questions cq
 ON cq.question_id = q.question_id
 JOIN classes c
 ON cq.class_id = c.class_id
 WHERE ub.user_id = $1`,
    [req.session.user.userId],
  );

  res.render('pages/profile_bookmarks', {
    user: req.session.user,
    questions: bookmarks,
  });
});

/**
 * MISC
 */

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
