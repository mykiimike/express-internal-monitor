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


app.get('/bis', function (req, res) {
	res.send('Hello World!')
})

app.get('/', function (req, res) {
	res.send('Hello World!')
})


var router = express.Router();

router.get('/subRouter1', function (req, res) {
	res.json({ok: 'thanks'});
});

router.post('/subRouter1', function (req, res) {
	res.json({ok: 'thanks'});
});


router.get('/subRouter2', function (req, res) {
	res.json({ok: 'thanks'});
});

app.use(router);

app.listen(3000, function () {
	console.log('Example app listening on port 3000!')
})

