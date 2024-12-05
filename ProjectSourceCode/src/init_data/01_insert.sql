INSERT INTO classes (class_name, class_desc)
VALUES
('CSCI2270', 'Data Structures'),
('CSCI2400', 'Computer Systems'),
('CSCI3308', 'Software Development Methods & Tools'),
('CSCI3104', 'Algorithms');

INSERT INTO questions (question_title, question_content, question_date) 
VALUES 
('Need help integrating this?', 'so i wnat to integrate this formula but I dont know how. pls help! (:SORT BY asdfasdf asdfasd florem impsadf;lasjdf lasd lorem ipsum dolor sit amet testing testing testing 123', CURRENT_DATE),
('Need help integrating this?', 'so i wnat to integrate this formula but I dont know how. pls help! (:SORT BY asdfasdf asdfasd florem impsadf;lasjdf lasd lorem ipsum dolor sit amet testing testing testing 123', CURRENT_DATE);
INSERT INTO classes_to_questions (class_id, question_id)
VALUES
(1, 1),
(1, 2);