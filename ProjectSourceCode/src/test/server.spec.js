// ********************** Initialize server **********************************

const server = require('../index'); //TODO: Make sure the path to your index.js is correctly added

// ********************** Import Libraries ***********************************

const chai = require('chai'); // Chai HTTP provides an interface for live integration testing of the API's.
const chaiHttp = require('chai-http');
chai.should();
chai.use(chaiHttp);
const {assert, expect} = chai;

// ********************** DEFAULT WELCOME TESTCASE ****************************

describe('Server!', () => {
  // Sample test case given to test / endpoint.
  it('Returns the default welcome message', done => {
    chai
      .request(server)
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
  // Expect: status is 201 and body is HTML (we expect a page to be rendered in response with status code indicating successful creation of new user)
  // Explanation: we expect success because the credentials fulfill all criteria
  it('positive: /register (1)', done => {
    chai
      .request(server)
      .post('/register')
      .send({username: 'testUser1', password1: 'abc2app*', password2: 'abc2app*'})
      .end((err, res) => {
        res.should.have.status(201); // indicate successful creation of new user
        res.should.be.html; // render the next page in the registration process (preferences)
        done();
      });
  });

  // Negative Testcase:
  // Input: {username: 'testUser2', password1: 'abc', password2: 'abc'}
  // Expect: status is 400 and body is HTML (we expect a page to be rendered in response with status code indicating failure)
  // Explanation: we expect failure because the password is too short (minimum length of 5)
  it('negative: /register (1)', done => {
    chai
      .request(server)
      .post('/register')
      .send({username: 'testUser2', password1: 'abc', password2: 'abc'})
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
    chai
      .request(server)
      .post('/register')
      .send({username: 'testUser1', password1: 'abc2app*', password2: 'abc2app*'})
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
    chai
      .request(server)
      .post('/register')
      .send({username: 'abc', password1: 'abc2app*', password2: 'abc2app*'})
      .end((err, res) => {
        res.should.have.status(400);
        res.should.be.html;
        done();
      });
  });
});

// API: /login
describe('Testing /login API', () => {
  // Positive Testcase:
  // Input: {username: 'testUser1', password: 'abc2app*'}
  // Expect: status is 302 and redirect to /profile route
  // Explanation: we expect success because the credentials correspond with existing user, and 
  // thus the user should be redirected to their profile
  it('positive: /login (1)', done => {
    chai
      .request(server)
      .post('/login')
      .send({username: 'testUser1', password: 'abc2app*'})
      .end((err, res) => {
        res.should.have.status(200); // indicate redirect
        res.should.redirectTo(/^.*127\.0\.0\.1.*\/profile$/);
        done();
      });
  });

  // Negative Testcase:
  // Input: {username: 'testUser1', password: 'abc}
  // Expect: status is 400 and HTML page is rendered
  // Explanation: we expect failure because the password is incorrect for the user 'testUser1' and 
  // response should render the login page again with an appropriate error message
  it('negative: /login (1)', done => {
    chai
      .request(server)
      .post('/login')
      .send({username: 'testUser1', password: 'abc'})
      .end((err, res) => {
        res.should.have.status(400);
        res.should.be.html;
        done();
      });
  });
});

// ********************************************************************************