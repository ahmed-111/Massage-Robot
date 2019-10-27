var http = require('http');
var url = require('url');
const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const moment = require('moment');

var bookableDays;

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

var startDate, endDate;

var requestType = '', requestMethod = '';

http.createServer(function (req, res) {
	  // set and reset main variables
	  bookableDays = {"success": true, "days": []};
	
	  var parsedURL = url.parse(req.url, true);
	  var query = parsedURL.query;
	  requestType = parsedURL.pathname;
	  requestMethod = req.method;
	  
	  var invalidInputError = 'Please check your input again and make sure it is numerical and then try again, thank you';
	  if( req.method === 'GET' ) {
		res.writeHead(200, {'Content-Type': 'text/plain'});
		//res.write(req.url + '\n');
		
		if (requestType == '/days' && requestMethod === 'GET') {
			var year = parseInt(query.year), month = parseInt(query.month);
			if (typeof(year) === 'number' && typeof(month) === 'number'){
				startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0));
				endDate = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth() + 1, 1, 0, 0));
			} else {
				//throw error
				res.writeHead(400, {'Content-Type': 'text/plain'});
				res.end(invalidInputError + '\n');
			}
			
			
		} else if (requestType == '/timeslots' && requestMethod === 'GET') {
			var year = parseInt(query.year), month = parseInt(query.month), day = parseInt(query.day);
			if (typeof(year) === 'number' && typeof(month) === 'number'){
				startDate = new Date(Date.UTC(year, month - 1, day, 0, 0));
				endDate = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1, 0, 0));
			} else {
				//throw error
				res.writeHead(400, {'Content-Type': 'text/plain'});
				res.end(invalidInputError + '\n');
			}
		} else {
			res.writeHead(404, {'Content-Type': 'text/plain'});
			res.end('Oops! The page you\'re looking for is just not there\n');
		}
		
		initiateCalendarAPI(res);

	  } else if (req.method === 'POST' && requestType === '/book'){
		var year = parseInt(query.year), month = parseInt(query.month), day = parseInt(query.day), hour = parseInt(query.hour),
			minute = parseInt(query.minute);
	 	if (typeof(year) === 'number' && typeof(month) === 'number' && typeof(day) === 'number' && typeof(hour) === 'number'
			&& typeof(minute) === 'number'){
			startDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
			endDate = new Date(Date.UTC(year, month - 1,
				day, hour, minute + 40));
		} else {
			//throw error
			res.writeHead(400, {'Content-Type': 'text/plain'});
			res.end(invalidInputError + '\n');
		}	  
		  
		  initiateCalendarAPI(res);
	  } else {
		res.writeHead(405, {'Content-Type': 'text/plain'});
		res.end('Method Not Allowed\n');
	  }
  }).listen(8080);
  
   console.log('Server started and listening on port 8080 for HTTP requests! - Vroom vroom!\n - Created by Ahmed');

//initiate calendarAPI
function initiateCalendarAPI(httpResponse) {
	fs.readFile('credentials.json', (err, content) => {
	  if (err) return console.log('Error loading client secret file:', err);
	  // Authorize a client with credentials, then call the Google Calendar API.
	  authorize(JSON.parse(content), listOutput, httpResponse);
	});	
}


/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback, httpResponse) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client, httpResponse);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listOutput(auth, httpResponse) {
	
	const calendar = google.calendar({version: 'v3', auth});
	var timeMin = startDate.toISOString(),
		timeMax = endDate.toISOString();
		
    var output = calendar.freebusy.query({	
		resource: {
			timeMin: timeMin,
			timeMax: timeMax,
			items: [{"id": 'primary'}],
			// timeZone: 'UTC',
			singleEvents: true,
			orderBy: 'startTime',	
		}
		}, (err, res) => {
			if(err) return console.log(err)
			
			var busy = res.data.calendars.primary.busy;
			var counter = 0;
					
			//****
			var noOfDays = getDaysRoundedUp(startDate, endDate);
			
			var weekend = false;
			
			var relevantYear = startDate.getFullYear();
			var relevantMonth = startDate.getMonth();
			for (i = 1; i <= noOfDays; i++) {
			  if (requestType === '/timeslots' || requestType === '/book') i = startDate.getDate();
			  var dayOfMonth = new Date(startDate.getFullYear(), startDate.getMonth(), i);
  			  // make non-opening hours (6pm to 9am) unbookable
			  busy.push({ start: new Date(Date.UTC(relevantYear, relevantMonth, i, 0, 0)).toISOString(),
						  end: new Date(Date.UTC(relevantYear, relevantMonth, i, 9, 0)).toISOString()
						});	
						
			   busy.push({ start: new Date(Date.UTC(relevantYear, relevantMonth, i, 18, 0)).toISOString(),
						  end: new Date(Date.UTC(relevantYear, relevantMonth, i, 24, 0)).toISOString()
						});		
			 		  
			  
			var hasTimeSlots = -1;			
			if (compareDates(dayOfMonth, new Date()) == -1 ||isWeekend(dayOfMonth)) hasTimeSlots = false;
			bookableDays['days'].push({ "day": i, "hasTimeSlots": hasTimeSlots });
			weekend = false;
			  
			}
			
			// give sorted array as parameter - sorted by startTime
			// otherwise causing some... PROBLEMS
			
			var finalOutput = slotsFromEvents(busy.sort((a, b) => new Date(a.start) - new Date(b.start)));
			
			// put event in Google Calendar
			if (requestMethod === 'POST' && requestType === '/book' && finalOutput.success == true){
				var newAppt = {
				  'summary': 'New Robot Massage Appointment',
				  'description': 'So here\'s proof AI\'s taking over everything',
				  'start': {
					'dateTime': finalOutput.startTime,
				  },
				  'end': {
					'dateTime': finalOutput.endTime,
				  }
				};
				
				var request = calendar.events.insert({
				  'calendarId': 'primary',
				  'resource': newAppt
				});
			}
			httpResponse.end(JSON.stringify(finalOutput, null, " "));
			return;
		});
	}

function slotsFromEvents(events) {
	freeSlots = []; 
	
    events.forEach(function (event, index) { //calculate free from busy times			
			//normal case and if no index exists after this that handled as well
			if(typeof events[index + 1] !== 'undefined') {
				var tempStartDate = new Date(event.end);
				var tempEndDate = new Date(events[index + 1].start);
				if (tempStartDate.getUTCHours() < 9){
					tempStartDate = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getUTCDate(), 9, 0));
				}
				if (tempEndDate > tempStartDate.getUTCHours() > 18){
					tempEndDate = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getUTCDate(), 18, 0));
				}
				freeSlots.push({startDate: tempStartDate.toISOString(), endDate: tempEndDate.toISOString()});
			}		
     });
	
	return grandFinale(freeSlots);
}

function grandFinale(freeSlots) {
	//iterate over arrays 
	availableTimeSlots = {"success": true, "timeSlots": []};
	bookableDays.days.forEach(function(dataBD, indexBD) {
      freeSlots.forEach(function(dataFS, indexFS) {
		   	if (new Date(dataFS.startDate).getDate() == dataBD.day && dataBD.hasTimeSlots != false){
				if (dataBD.hasTimeSlots == -1) dataBD.hasTimeSlots = true;
				intervals(dataFS.startDate, dataFS.endDate, availableTimeSlots);
			}
	  });
    });

	if (requestMethod === 'GET' && requestType === '/days'){ 
		return bookableDays;
	} else if (requestMethod === 'GET' && requestType === '/timeslots'){ 
		return availableTimeSlots;
	} else if (requestMethod === 'POST' && requestType === '/book'){
		var errorMsg = '';
		if (getDaysExactly(new Date(), startDate) < 1){
			errorMsg = 'Cannot book with less than 24 hours in advance'
			return { "success": false, "message": errorMsg }
		} else if (startDate < new Date()) {
			errorMsg = 'Cannot book time in the past'
			return { "success": false, "message": errorMsg }
		} else if (isWeekend(startDate) || isOutsideTradingHours(startDate)){
			errorMsg = 'Cannot book outside bookable timeframe'
			return { "success": false, "message": errorMsg }
		}
		
		for (let dataATS of availableTimeSlots.timeSlots){
			if (compareDates(dataATS.startTime, startDate) == 0 && getDaysExactly(new Date(), startDate) >= 1) {
				// success, appointment available
				return { "success": true, "startTime": dataATS.startTime, "endTime": dataATS.endTime };
			}
		}
		//only other option is invalid
		errorMsg = 'Invalid time slot';
		return { "success": false, "message": errorMsg };
	}

	
	
}

Date.prototype.addDays = function(days) {
    var date = new Date(this.valueOf());
    date.setDate(date.getDate() + days);
    return date;
}

var getDaysRoundedUp = function(date1,date2) {
 
	// To calculate the time difference of two dates 
	var differenceInTime = date2.getTime() - date1.getTime(); 
	  
	// To calculate the no. of days between two dates 
	var differenceInDays = differenceInTime / (1000 * 3600 * 24); 
	return Math.ceil(differenceInDays);
};

var getDaysExactly = function(date1,date2) {
 
	// To calculate the time difference of two dates 
	var differenceInTime =  Math.abs(date2.getTime() - date1.getTime()); 
	  
	// To calculate the no. of days between two dates 
	var differenceInDays = differenceInTime / (1000 * 3600 * 24); 
	return differenceInDays;
};

var minutesBetweenTwoDates = function(date1,date2) {
 
	var diff = Math.abs(new Date(date1) - new Date(date2));

	var minutes = Math.floor((diff/1000)/60);

return minutes;

};

var compareDates = function(date1,date2) {
 
	var g1 = new Date(date1); 
    var g2 = new Date(date2); 
    if (g1.getTime() === g2.getTime()) 
        return 0; //both equal 
    else if (g1 > g2)
        return 1; // g1 > g2
	else if (g1 < g2)
		return -1; // g1 < g2

};

function intervals(startString, endString, result) {
	
	var start = moment.utc(startString, 'YYYY-MM-DD hh:mm a');
    var end = moment.utc(endString, 'YYYY-MM-DD hh:mm a');

    // round starting minutes up to nearest 15 (12 --> 15, 17 --> 30)
    // note that 59 will round up to 60, and moment.js handles that correctly
   // start.minutes(Math.ceil(start.minutes() / 15) * 15);

    var current = moment(start);
    while (current < end && current.hours() < 18) {
		var toPush = {};
		toPush.startTime = current.format();
        current.add(40, 'minutes');
		toPush.endTime = current.format()
		result.timeSlots.push(toPush);
		current.add(5, 'minutes');
    }
	
	return result;
}

 function daysInMonth (date) { 
    return new Date(date.getFullYear(), date.getMonth(), 0).getDate(); 
 } 
 
 function isWeekend (date) {
	var weekend = false;
    var dayOfMonth = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	var dayOfWeek = dayOfMonth.getDay();
	if (dayOfWeek == 0 || dayOfWeek == 6) weekend = true;
	return weekend;
} 
 
 function isOutsideTradingHours (date) { 
	var outsideTradingHours = !(date.getUTCHours() >= 9 && date.getUTCHours() < 18)
	return outsideTradingHours;
 } 



 