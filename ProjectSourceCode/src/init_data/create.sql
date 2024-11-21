CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY NOT NULL,
  username VARCHAR(15) NOT NULL,
  password CHAR(60) NOT NULL
);

CREATE TABLE IF NOT EXISTS users_to_classes (
  user_id INT NOT NULL,
  class_id INT NOT NULL
);

CREATE TABLE IF NOT EXISTS users_to_bookmarks (
  user_id INT NOT NULL,
  question_id INT NOT NULL
);

CREATE TABLE IF NOT EXISTS users_to_asked_questions (
  user_id INT NOT NULL,
  question_id INT NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  class_id SERIAL PRIMARY KEY NOT NULL,
  class_name VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS classes_to_questions (
  class_id SERIAL PRIMARY KEY NOT NULL,
  question_id INT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  question_id SERIAL PRIMARY KEY NOT NULL,
  question_name VARCHAR(50) NOT NULL,
  questions_info VARCHAR(150) NOT NULL
);


ALTER TABLE classes_to_questions
  ADD CONSTRAINT fk_cq_questions 
  FOREIGN KEY (question_id)
  REFERENCES questions(question_id);