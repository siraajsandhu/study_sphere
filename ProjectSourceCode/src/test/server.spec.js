// ********************** Initialize server **********************************

const server = require('../index'); //TODO: Make sure the path to your index.js is correctly added
const FormData = require('form-data');

// ********************** Import Libraries ***********************************

const chai = require('chai'); // Chai HTTP provides an interface for live integration testing of the API's.
const chaiHttp = require('chai-http');
chai.should();
chai.use(chaiHttp);
const {assert, expect} = chai;

// use an agent to preserve cookies
const agent = chai.request.agent(server);

// ********************** DEFAULT WELCOME TESTCASE ****************************

describe('Server!', () => {
  // Sample test case given to test / endpoint.
  it('Returns the default welcome message', done => {
    agent
      .get('/welcome')
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body.status).to.equals('success');
        assert.strictEqual(res.body.message, 'Welcome!');
        done();
      });
  });
});

// *********************** TODO: WRITE 2 UNIT TESTCASES **************************

// API: /register
describe('Testing /register API', () => {
  // Positive Testcase:
  // Input: {username: 'testUser1', password1: 'abc2app*', password2: 'abc2app*'}
  // Expect: status is 200 and body is HTML (we expect to be redirected after creation of new user with success status)
  // Explanation: we expect success because the credentials fulfill all criteria
  it('positive: /register (1)', done => {
    agent
      .post('/register')
      .send({username: 'testUser1', password: 'abc2app*', confirmPassword: 'abc2app*'})
      .end((err, res) => {
        res.should.have.status(200); // indicate successful creation of new user
        res.should.be.html; // render the next page in the registration process (preferences)
        done();
      });
  });

  // Negative Testcase:
  // Input: {username: 'testUser2', password1: 'abc', password2: 'abc'}
  // Expect: status is 400 and body is HTML (we expect a page to be rendered in response with status code indicating failure)
  // Explanation: we expect failure because the password is too short (minimum length of 5)
  it('negative: /register (1)', done => {
    agent
      .post('/register')
      .send({username: 'testUser2', password: 'abc', confirmPassword: 'abc'})
      .end((err, res) => {
        res.should.have.status(400);
        res.should.be.html;
        done();
      });
  });

  // Negative Testcase:
  // Input: {username: 'testUser1', password1: 'abc', password2: 'abc'}
  // Expect: status is 400 and body is HTML (we expect a page to be rendered in response with status code indicating failure)
  // Explanation: we expect 400 because the user already exists in the DB (check positive test case)
  it('negative: /register (2)', done => {
    agent
      .post('/register')
      .send({username: 'testUser1', password: 'abc2app*', confirmPassword: 'abc2app*'})
      .end((err, res) => {
        res.should.have.status(400);
        res.should.be.html;
        done();
      });
  });

  // Negative Testcase:
  // Input: {username: 'abc', password1: 'abc2app*', password2: 'abc2app*'}
  // Expect: status is 400 and body is HTML (we expect a page to be rendered in response with status code indicating failure)
  // Explanation: we expect 400 because the username should be too short (minimum length of 5)
  it('negative: /register (3)', done => {
    agent
      .post('/register')
      .send({username: 'abc', password: 'abc2app*', confirmPassword: 'abc2app*'})
      .end((err, res) => {
        res.should.have.status(400);
        res.should.be.html;
        done();
      });
  });
});

// API: /login
describe('Testing /login API', () => {
  // Negative Testcase:
  // Input: {username: 'testUser1', password: 'abc}
  // Expect: status is 400 and HTML page is rendered
  // Explanation: we expect failure because the password is incorrect for the user 'testUser1' and 
  // response should render the login page again with an appropriate error message
  it('negative: /login (1)', done => {
    agent
      .post('/login')
      .send({username: 'testUser1', password: 'abc'})
      .end((err, res) => {
        res.should.have.status(400);
        res.should.be.html;
        done();
      });
  });

  // Positive Testcase:
  // Input: {username: 'testUser1', password: 'abc2app*'}
  // Expect: status is 302 and redirect to /profile route
  // Explanation: we expect success because the credentials correspond with existing user, and 
  // thus the user should be redirected to their profile
  it('positive: /login (1)', done => {
    agent
      .post('/login')
      .send({username: 'testUser1', password: 'abc2app*'})
      .end((err, res) => {
        res.should.have.status(200); // indicate redirect
        res.should.redirectTo(/^.*127\.0\.0\.1.*\/profile$/);
        done();
      });
  });
});

const DYNAMIC_CLASS_INFO = {};

// API: /create (Home class creation)
describe('Testing /create API (home route)', () => {
  // positive test case
  // input: { class_dept: ABCD, class_num: 1234, class_desc: "An example class description" }
  // expect: status 200 and html body
  // explanation: expect success and html body because app will redirect to new class page
  // should be able to create a class because we logged in in the previous test case (/login)
  it('positive: /create (1)', done => {
    agent
      .post('/create')
      .send({ class_dept: 'ABCD', class_num: 1234, class_desc: "An example class description" })
      .end((err, res) => {
        res.should.have.status(200)
        res.should.redirectTo(/^.*127\.0\.0\.1.*\/class\/\d+\/find$/)
        DYNAMIC_CLASS_INFO.path = res.req.path.split('/').slice(0, -1).join('/');
        console.log('DYN', DYNAMIC_CLASS_INFO);
        done();
      });
  });

  // negative test case
  // input: { class_dept: ABCD, class_num: 1234, class_desc: "An example class description" }
  // expect: status 200 and html redirect
  // explanation: expect redirect back to /create since class already exists
  // should be able to create a class because we logged in in the previous test case (/login)
  it('negative: /create (1)', done => {
    agent
      .post('/create')
      .send({ class_dept: 'ABCD', class_num: 1234, class_desc: "An example class description" })
      .end((err, res) => {
        res.should.have.status(200)
        res.should.redirectTo(/^.*127\.0\.0\.1.*\/create/);
        done();
      });
  });
});

// API: /profile
describe('Testing /profile/update API', () => {
  // positive test case
  // input: { oldPwd: 'abc2app*', newPwd: 'sssss', confirmNewPwd: 'sssss' }
  // expect: status 200 and html body
  // explanation: expect success code since the password matches the existing password
  // and the new password is satisfactory
  // should be able to access profile because we logged in previously
  it('positive: /profile/update (1)', done => {
    agent
      .post('/profile/update')
      .send({ oldPwd: 'abc2app*', newPwd: 'sssss', confirmNewPwd: 'sssss' })
      .end((err, res) => {
        res.should.have.status(200)
        res.should.be.html;
        done();
      });
  });

  // negative test case
  // input: { oldPwd: 'wrong_pwd', newPwd: 'xxxxx', confirmNewPwd: 'xxxxx' }
  // expect: status 400 and html body
  // explanation: expect failure code since the password does not match the existing password
  // should be able to access profile because we logged in previously
  it('negative: /profile/update (1)', done => {
    agent
      .post('/profile/update')
      .send({ oldPwd: 'wrong_pwd', newPwd: 'xxxxx', confirmNewPwd: 'xxxxx' })
      .end((err, res) => {
        res.should.have.status(400)
        res.should.be.html;
        done();
      });
  });
});

// ********************************************************************************