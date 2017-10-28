/*!
 * express-internal-monitor
 * Copyright(c) 2017 Michael Vergoz
 * MIT Licensed
 */

"use strict";

const fs = require('fs')
const http = require('http');
const URL = require('url');

const debug = require('debug')('express:monitor');
const debugLayer = require('debug')('express:monitor:layer');
const debugLog = require('debug')('express:monitor:log');
const debugInflux = require('debug')('express:monitor:influxDB');

function normalize(name) {
	return(name.replace([' '], ['-']));
}

function monitor(app, options) {
	var self = this;
	this.app = app;

	if(!options)
		options = {};

	this.options = {
		path: options.path || process.cwd(),
		influxDB: options.influxDB || null,
		logFile: options.logFile || true,
		statHandle: options.statHandle || true,
		statRouter: options.statRouter || true,
		serverName: options.serverName || "root",
	}
	
	if(this.options.influxDB)
		this.influxInit();

	// rotate logs
	this.logRotate();

	function bgScanner() {
		debug('scanning router stack');

		var stack = self.app._router.stack;

		for(var a=0; a<stack.length; a++) {
			let Layer = stack[a];
			
			if(Layer.em)
				continue;
			Layer.em = {};

			let name = normalize(Layer.name);

			if(self.options.statHandle === true) {
				debug('Pathing Layer '+name);

				// patch handle
				Layer.em.handle = Layer.handle;
				Layer.handle = function(req, res, next) {
					var hName = name+'.handle';
					var start = new Date().getTime();
					var ret = Layer.em.handle.call(Layer, req, res, next);
					var end = new Date().getTime();
					var res = end-start;
					self.log('layer', hName, res);
					debugLayer('Handle execution '+hName+' '+res+'ms')
					return(ret);
				}
			}

			// patch routes
			if(Layer.route && self.options.statRouter === true) {
				// iterate on functions
				for(var b=0; b<Layer.route.stack.length; b++) {
					let rLayer = Layer.route.stack[b];

					if(rLayer.em)
						continue;
					rLayer.em = {};

					let rName = rLayer.method+'.'+Layer.route.path;

					// patch handle
					rLayer.em.handle = rLayer.handle;
					rLayer.handle = function(req, res, next) {
						var start = new Date().getTime();

						// Use writeHead to detect the end 
						var r = res;
						var old = r.writeHead;
						res.writeHead = function() {
							var end = new Date().getTime();
							var res = end-start;
							self.log('route', rName, res);
							debugLayer('Route layer execution '+rName+' '+res+'ms')

							return(old.apply(r, arguments));
						}

						// call the handler
						var ret = rLayer.em.handle.call(rLayer, req, res, next);

						return(ret);
					}
				}

			}
		}

		setTimeout(bgScanner, 60000);
	}

	setTimeout(bgScanner, 1000);
}

monitor.prototype.influxInit = function(date, rail, timing) {
	this.influxStack = [];
	var opt = this.options.influxDB;

	opt.concurrent = opt.concurrent || 1000;
	opt.parsedURL = URL.parse(opt.url);
	opt.writeURL = '/write?db='+opt.db+'&precision=ms';

	debugInflux("Initializing connection to "+opt.url+' with '+opt.concurrent+' concurrent data points');
}

monitor.prototype.influxPostData = function(lines, done) {
	var conf = this.options.influxDB;

	// An object of options to indicate where to post to
	var postOptions = {
		protocol: conf.parsedURL.protocol,
		host: conf.parsedURL.hostname,
		port: conf.parsedURL.port,
		path: conf.writeURL,
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Content-Length': Buffer.byteLength(lines)
		}
	};

	// Set up the request
	var postReq = http.request(postOptions, function(res) {
		res.setEncoding('utf8');
		debugInflux('Got response with status code '+res.statusCode);
		res.on('data', () => {});
		res.on('end', () => {
			process.nextTick(done);
		});
	});

	// post the data
	postReq.write(lines);
	postReq.end();
}

monitor.prototype.influxInsert = function(date, zone, rail, timing) {
	var self = this;
	var conf = this.options.influxDB;

	this.influxStack.push(arguments);

	// main bg rotation
	function rotate() {
		var payload = '';
		var counter = 0;
		do {
			var el = self.influxStack.shift();
			if(!el)
				break;

			payload += 'function,server='+self.options.serverName+',zone='+el[1]+',rail='+el[2]+' value='+el[3]+' '+el[0].getTime()+"\n";
			counter++;
		} while(counter < conf.concurrent);

		if(payload.length == 0) {
			self.influxTimer = null;
			return;
		}

		// post payload 
		self.influxPostData(payload, () => {
			self.influxTimer = setTimeout(rotate, 1000);
		});		
	}

	// async write to influx
	if(!this.influxTimer)
		this.influxTimer = setTimeout(rotate, 1000);
}

monitor.prototype.logRotate = function() {
	if(this.options.logFile != true)
		return;

	debug("Rotating logs");
	if(this.logStream) {
		this.logStream.destroy();
	}
	this.logStream = fs.createWriteStream(this.options.path+'/express-monitor.log', {
		flags: 'a+',
		mode: 0o660
	});
}

monitor.prototype.log = function(zone, rail, timing) {
	var date = new Date();

	var buffer = date.toISOString()+' '+timing+'ms '+zone+'/'+rail;
	debugLog(buffer);

	if(this.options.logFile == true)
		this.logStream.write(buffer+'\n');

	if(this.options.influxDB)
		this.influxInsert(date, zone, rail, timing);
}

module.exports = function(app, options) {
	app.em = new monitor(app, options);

}