const bcrypt = require('bcrypt');

const password = 'Mis@ui';
bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error(err);
  } else {
    console.log('Hashed password:', hash);
    console.log('\nCopy this hash and use it in the SQL below');
  }
});