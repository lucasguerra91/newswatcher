const express = require('express'); // Route handlers and templates usage
const path = require('path'); // Populating the path property of the request
const logger = require('morgan'); // HTTP request logging
const bodyParser = require('body-parser'); // Access to the HTTP request body
const cp = require('child_process'); // Forking a separate Node.js processes
const responseTime = require('response-time'); // Performance logging
const assert = require('assert'); // assert testing of values
const helmet = require('helmet'); // Security measures
const RateLimit = require('express-rate-limit'); // IP based rate limiter
const csp = require('helmet-csp');

// reading in off secrets
if(process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}


/* const users = require('./routes/users');
const session = require('./routes/session');
const sharedNews = require('./routes/sharedNews');
const homeNews = require('./routes/homeNews'); */

const app = express()
const port = 3000
app.enable('trust proxy');

// Apply limits to all requests
const limiter = new RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  delayMs: 0 // disable delaying - full speed until the max limit
  });
  app.use(limiter);
  app.use(helmet()); // Take the defaults to start with
  
  app.use(csp({
    // Specify directives for content sources
    directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", 'ajax.googleapis.com','maxcdn.bootstrapcdn.com'],
    styleSrc: ["'self'", "'unsafe-inline'", 'maxcdn.bootstrapcdn.com'],
    fontSrc: ["'self'", 'maxcdn.bootstrapcdn.com'],
    imgSrc: ['*']
    }
  }));

  // Adds an X-Response-Time header to responses to measure response times
app.use(responseTime());

// logs all HTTP requests. The "dev" option gives it a specific styling
app.use(logger('dev'));

// Sets up the response object in routes to contain a body property with an
// object of what is parsed from a JSON body request payload
// There is no need for allowing a huge body, it might be some attack,
// so use the limit option
app.use(bodyParser.json({ limit: '100kb' }));

// Main HTML page to be returned is in the build directory
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Serving up of static content such as HTML for the React
// SPA, images, CSS files, and JavaScript files
app.use(express.static(path.join(__dirname, 'build')));

/* 
const node2 = cp.fork('./worker/app_FORK.js');

node2.on('exit', function (code) {
  ​node2 = undefined;
  ​node2 = cp.fork('./worker/app_FORK.js');
}); */
  

app.get('/', (req, res) =>{
    console.log('Received a GET request')
    res.send('Hello World!')
})


const server = app.listen(port, () => console.log('Example app listening on port port ' + port +'!'))

