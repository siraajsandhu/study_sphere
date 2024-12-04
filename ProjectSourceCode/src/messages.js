(function() {
  module.exports.register_invalidUserOrPwd = () =>
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
</div>`;

  module.exports.register_userExists = name => `User with name '${name}' already exists. Please choose another username.`;

  module.exports.login_invalidUserOrPwd = () => `Invalid username or password`;

  module.exports.profile_pwdMatchFailure = () => `Old password does not match current password</p>`;

  module.exports.profile_invalidPwd = () => 
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
</div>`;

  module.exports.profile_pwdUpdateSuccess = () => `Profile updated successfully`;

  module.exports.profile_deletedClass = name => `Removed class '${name}'`;

  module.exports.home_courseExists = name => `Class '${name}' already exists.`;
  module.exports.home_needsAccountToCreate = () => `You need an account to create a class!`;
  module.exports.home_joinedClass = name => `Joined class '${name}'`;

  module.exports.class_askedQuestion = () => `Your question was posted to the class page!`;
  module.exports.class_needsAccountToAsk = () => `You need an account to ask a question!`;
  module.exports.class_left = () => `Successfully left class!`;
  module.exports.class_joined = () => `Successfully joined class!`;
  module.exports.class_needsAccountChat = () => `You need an account to join the chat!`;
}());