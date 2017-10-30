/*!
 * express-internal-monitor
 * Copyright(c) 2017 Michael Vergoz
 * MIT Licensed
 */

const express = require('express')
const expressInternalMonitor = require('./index')

var app = express()

// initialize the application
expressInternalMonitor(app, {
	influxDB: {
		url: 'http://localhost:8086',
		db: 'monitor'
	}
});

// static handle
app.use(express.static(__dirname + '/static', { maxAge: 200000 }));

// slow route
app.get('/next', function (req, res) {
	setTimeout(() => {
		res.send('Hello World! next')
	}, 1000)
})

app.get('/', function (req, res) {
	res.send('Hello World!')
})

app.listen(3000, function () {
	console.log('Example app listening on port 3000!')
})


