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
  class_name VARCHAR(50) NOT NULL,
  class_desc VARCHAR(150) NOT NULL
);

CREATE TABLE IF NOT EXISTS classes_to_questions (
  class_id INT NOT NULL,
  question_id INT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  question_id SERIAL PRIMARY KEY NOT NULL,
  question_title VARCHAR(200) NOT NULL,
  question_content VARCHAR(10000) NOT NULL,
  question_date DATE
);

CREATE TABLE IF NOT EXISTS questions_to_images (
  question_id INT NOT NULL,
  image_id INT NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  image_id SERIAL PRIMARY KEY NOT NULL,
  image_key VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS answers (
  answer_id SERIAL PRIMARY KEY NOT NULL,
  answer_content VARCHAR(10000) NOT NULL,
  answer_date DATE
);

CREATE TABLE IF NOT EXISTS questions_to_answers (
  question_id INT NOT NULL,
  answer_id INT NOT NULL
);

CREATE TABLE IF NOT EXISTS users_to_answers (
  user_id INT NOT NULL,
  answer_id INT NOT NULL
);

CREATE TABLE IF NOT EXISTS answers_to_images (
  answer_id INT NOT NULL,
  image_id INT NOT NULL
);

CREATE TABLE IF NOT EXISTS answers_like_status (
  user_id INT NOT NULL,
  answer_id INT NOT NULL,
  like_status INT NOT NULL
);

ALTER TABLE classes_to_questions
  ADD CONSTRAINT fk_cq_questions 
  FOREIGN KEY (question_id)
  REFERENCES questions(question_id);

-- INSERT INTO classes (class_name, class_desc) VALUES 
-- ('Mathematics', 'An introduction to algebra, geometry, and calculus.'),
-- ('Physics', 'Study of the laws of nature and the universe.'),
-- ('Chemistry', 'Fundamentals of organic and inorganic chemistry.'),
-- ('Biology', 'Exploration of living organisms and ecosystems.'),
-- ('History', 'Overview of world history from ancient to modern times.'),
-- ('Geography', 'Study of Earth’s landscapes, environments, and people.'),
-- ('English Literature', 'Analysis of classic and contemporary literature.'),
-- ('Creative Writing', 'Workshop focused on storytelling and creative prose.'),
-- ('Economics', 'Principles of micro and macroeconomics.'),
-- ('Computer Science', 'Basics of programming and computer systems.'),
-- ('Art', 'Introduction to painting, drawing, and sculpture.'),
-- ('Music', 'Exploring musical theory and instrument techniques.'),
-- ('Philosophy', 'Examination of fundamental questions and ethical theories.'),
-- ('Psychology', 'Understanding human behavior and mental processes.'),
-- ('Sociology', 'Study of society, culture, and social relationships.'),
-- ('Political Science', 'Introduction to political systems and governance.'),
-- ('Environmental Science', 'Exploration of environmental challenges and solutions.'),
-- ('Theater', 'Basics of acting, directing, and stage production.'),
-- ('Business Studies', 'Introduction to management, marketing, and finance.'),
-- ('Health Science', 'Study of human health, wellness, and medical fields.');
