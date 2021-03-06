var express    = require('express'),
      app      = express(),
      bodyParser  = require('body-parser'),
      auth     = require('./controllers/auth'),
      Yelp     = require('yelp'),
      bcrypt      = require('bcryptjs'),
      cities      = require('cities'),
      Sequelize   = require('sequelize');

require('dotenv').load(); // require and load dotenv
// configure bodyParser (for receiving form data)
app.use(bodyParser.urlencoded({
   extended: true
}));
app.use(bodyParser.json());


/*********************** Served up directories ******************************/
app.use(express.static(__dirname + '/public'));
app.set('views', '/views');

/*********************** ROUTES ******************************/
// var routes = require('./routes/routes.js');
// app.use(routes, function(req, res, next) {
//    console.log('server routes')
//    next();
// });
/**************** DATABASE ************************/

var db = require('./models'),
   User = db.models.User,
   Trip = db.models.Trip,
   Event = db.models.Event;


/*********************** Yelp request function ******************************/
var yelpArr=[process.env.consumer_key,process.env.consumer_secret,
               process.env.token,process.env.token_secret];

// console.log(yelpArr)
var yelp = new Yelp({
   consumer_key: yelpArr[0],
   consumer_secret: yelpArr[1],
   token: yelpArr[2],
   token_secret: yelpArr[3]
});



var city = {};

app.post('/api/post', function(req, res) {
   // console.log(req.body.formInfo)
   var infoObj = req.body.formInfo
   var latReal = req.body.gps[0];
   var lngReal = req.body.gps[1];
   if (infoObj.hasOwnProperty('scenic'))
      var scenicProp = 'hikes';
   if (infoObj.hasOwnProperty('city'))
      var cityProp = 'tourist';
   var city = cities.gps_lookup(latReal, lngReal).city;
   // console.log(city);
   yelpgo(city, res);
});



function yelpgo(city, res, cityProp, scenicProp) {

   yelp.search({
         term: cityProp +","+ scenicProp,
         location: city
      })
      .then(function(data) {
         // console.log(data.businesses);
         var yelpResults = data.businesses;
         res.json(yelpResults);
         // console.log(yelpResults);
         app.post('/api/yelp', function(req, res) {
         var businesses = yelpResults;
         res.send(businesses[0]);
         // console.log(businesses);
      });
         // console.log(yelpResults);
      })
      .catch(function(err) {
         // console.error(err);
      });
   console.log(city + "you did it boss");
}

/**** saves to trip db table ****/
app.post('/api/trips',function(req,res){
   var len =req.body.length;
   var tripCreate = function(where,howLong){
      return Trip.create({
      'where': where,
      'howLong': howLong
      })
   }
   var eventCreate = function(object){
         Event.create(object) //need to JSON.parse to retreive
         .catch(Sequelize.ValidationError,function(err){
            console.log(err)
         })
         .catch(function(err){
            console.log(err)
         })
    }
   // console.log('whole request',strObj)

      tripCreate('denver','7')
      .then(function(trip){
            req.body.forEach(function(event){  //pulls out individual events
               event.tripId = trip.id;
               var cur={
                  name: event.name,
                  image_url: event.image_url,
                  display_address: event.display_address,
                  display_phone: event.display_phone,
                  rating: event.rating,
                  snippet_text: event.snippet_text
            }
            console.log('cur',cur) // cur is the new event
            Event.create(cur);
            })
      })
      res.send('success')
})

/*********** profile requests *********/
// get users
app.get('/users', function(req, res) {
   console.log('/users');
   User.find({},function(err, user) {
      res.json(user);
   });
});
// get all trips
app.get('/users/trips', function(req, res) {
   console.log('all trips in db /users/trips');
   Trip.find({},function(err, trip) {
      res.json(trip);
   });
});
//get current user's saved trips
app.get('/users/:id', function(req, res) {
   console.log('getting current users trips @ /users/:id');
   User.findById(req.params.id,{
      include: Trip
   })
   .then(function(user) {
    if(!user) return error(res, "not found");

      res.json(user);
   });
});
//delete saved trip
app.delete('/users/trips/:id', function(req, res) {
  Trip.findById(req.params.id)
  .then(function(trip){
    if(!trip) return error(res, "not found");
    return trip.destroy();
  })
});

/*********** Auth **************/
// api/me is the route used for authentication
app.get('/api/me', auth.ensureAuthenticated, function(req, res) {
   console.log('api/me');
   console.log(req.user)
   User.findById(req.user, function(err, user) {
      res.send(user.populate('posts'));
   });
});



app.post('/auth/signup', function(req, res) {      
   // console.log('POST auth/signup password',ÿreq.body.email);
   User.find({where:{email:req.body.email}})
      .then(function(doc,err){
      if(err){console.log('ERROR1!!!',err); return res.send(err)
      } else if(!doc){ //if no current users are found
      bcrypt.genSalt(10, function(err, salt) {     //this is where passwords from the front end form are salted and hashed
      bcrypt.hash(req.body.password, salt, function(err, hash) {
         req.body.password = hash;
         // console.log('hashed', req.body.password);
         User.create(req.body)   // opens up /models and creates a user to the psql db
            .done(function(user) {
               // if (!user) return error(res, "not saved");
               auth.createJWT(user);
               return res.send({
                  token: auth.createJWT(user),     //sends an authentication token to the front end (user is logged in)
                  user: user
               })
            })
            })
            })
      } else {
         console.log('failed',res.body,req.body)
         res.send('Sorry, but that e-mail has already been registered.')
      }
   })





});
app.post('/auth/login', function(req, res) {
   User.findOne({
      where: {email: req.body.email}})
         .done(function(user) {
      // var compare = 'user.$modelOptions.instanceMethods.comparePassword';  // to call method stored in user model

      if (!user) {
         return res.status(401).send({
            message: 'Invalid email or password.'
         });
      }
      validPassword = function() {
         bcrypt.compare(req.body.password, user.dataValues.password, function(err, isMatch) { // both 'exploded' using the has from user.dataValues
            if (isMatch === true) {
               res.send({     //object contains token and user info
                  token: auth.createJWT(user),
                  user: user
               });
            } else{
               res.send('error: that password does not match')
            }
         });
      };
      validPassword(); 
   });
});




app.all('/*', function(req, res) { // one page app -- angular appends to index.html using ui-view
   res.sendFile(__dirname + '/public/views/index.html');
});





// console.log('env',process.env)

/*********************** SERVER ******************************/
app.listen(process.env.PORT || 3000, function() {
   console.log('BOOM, Express is firing on all cylinders');
});

module.exports = app; //for testing