"use strict";

/*
 * Created with @iobroker/create-adapter v1.14.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
// const fs = require("fs");
const schedule = require('node-schedule');
//const netcat = require('node-netcat');
const telnet = require('telnet-client');
var parser = require('cron-parser');

var gthis; 
var sv_data;
var sv_cmd = "00*";
var conn;

function calcChecksum(string) {
	var buf = new Buffer(string);
	// Calculate the modulo 256 checksum
	var sum = 0;
	for (var i = 0, l = buf.length-4; i < l; i++) {
		sum = (sum + buf[i]) % 256;
	}
	return sum;
}

class Solarviewdatareader extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "solarviewdatareader",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("objectChange", this.onObjectChange.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}
	
	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		gthis = this; //global verfügbar machen
		// Konfiguration lesen und als Info ausgeben
		const ip_address = this.config.ipaddress;
		const port = this.config.port;

		this.log.info("ipaddress: " + ip_address);
		this.log.info("port: " + this.config.port);
		this.log.info("d0 converter: " + this.config.d0converter.toString());

		/*
		For every state in the system there has to be also an object of type state
		*/
		
		//Datenobjekte erzeugen
		var arrTcp = [];
		var arrTcpLen = arrTcp.push("pvig"); // PV Gesamtanlage
		if (gthis.config.d0converter == true){ //d0converter hinzufügen
			arrTcp.push("d0supply"); //Einspeisezähler
			arrTcpLen = arrTcp.push("d0consumption"); //Verbrauchszähler
		}
		const arrDp1 = ['actualy', 'daily', 'monthly', 'yearly', 'total', 'lastupdate']; //Datenpunkte
		const arrType1 = ['number', 'number', 'number', 'number', 'number', 'date']; //Datentypen
		const arrUnit1 = ['W', 'kWh', 'kWh', 'kWh', 'kWh', '']; // Einheiten
		var arrDpLen = arrDp1.length;
		for (var i = 0; i < arrTcpLen; i++) { // normale Datenpunkte
			for (var dp = 0; dp < arrDpLen; dp++) {
				gthis.log.info("create object: " + arrTcp[i] + "." + arrDp1[dp]); // Anlage Datenobjekte loggen
				await gthis.setObjectAsync(arrTcp[i] + "." + arrDp1[dp], {
					type: "state",
					common: {
						name: arrDp1[dp],
						type: arrType1[dp],
						role: "indicator",
						unit: arrUnit1[dp],
						read: true,
						write: false,
					},
					native: {},
				});
			}				
		}

		var arrInv = [];
		for (var inv = 1; inv < 5; inv++) { // zusätzliche Datenobjekte für Wechselrichter
			if (eval("gthis.config.pvi" + inv) == true){
				arrInv.push("pvi" + inv);
			}
		}
		const arrInvLen = arrInv.length;

		const arrDp2 = ['udc', 'idc', 'udcb', 'idcb', 'udcc', 'idcc', 'ul1', 'il1', 'ul2', 'il2', 'ul3', 'il3', 'tkk']; //zusätzliche Datenpunkte
		const arrDp = arrDp1.concat(arrDp2);
		arrDpLen = arrDp.length;
		
		const arrType2 = ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']; //Datentypen für zusätzliche Datenpunkte
		const arrType = arrType1.concat(arrType2);
		const arrUnit2 = ['V', 'A', 'V', 'A', 'V', 'A', 'V', 'A', 'V', 'A', 'V', 'A', '°C']; //Einheiten für zusätzliche Datenpunkte
		const arrUnit = arrUnit1.concat(arrUnit2);
		gthis.log.info("len: " + arrInvLen);
		for (var i = 0; i < arrInvLen; i++) { // Datenpunkte für Wechselrichter anlegen
			for (var dp = 0; dp < arrDpLen; dp++) {
				gthis.log.info("create object: " + arrInv[i] + "." + arrDp[dp]);
				await gthis.setObjectAsync(arrInv[i] + "." + arrDp[dp], {
					type: "state",
					common: {
						name: arrDp[dp],
						type: arrType[dp],
						role: "indicator",
						unit: arrUnit[dp],
						read: true,
						write: false,
					},
					native: {},
				});
			}				
		}		
		
		// in this template all states changes inside the adapters namespace are subscribed
		this.subscribeStates("*");

		const starttime = this.config.intervalstart;
		const endtime   = this.config.intervalend;

		conn = new telnet();
 
		//telnet parameters
		var params = {
		  host: ip_address,
		  port: port,
		  debug: true,
		  shellPrompt: '/ # ',
		  timeout: 3000
		};
		
		try {
			var interval = parser.parseExpression(this.config.interval);
			this.log.info("CRON string: " + this.config.interval);
			//this.log.info('Date: ', interval.next().toString());
			this.log.info("interval start: " + this.config.intervalstart);
			this.log.info("interval end: " + this.config.intervalend);
			var j = schedule.scheduleJob(this.config.interval, function(){
				const dnow = new Date();
				var dstart = new Date(dnow.getFullYear() + "-" + (dnow.getMonth()+1) + "-" + dnow.getDate() + " " + starttime);
				var dend = new Date(dnow.getFullYear() + "-" + (dnow.getMonth()+1) + "-" + dnow.getDate() + " " + endtime);
				if (gthis.config.d0converter == true){ //Verbrauch wird immer eingelesen
					setTimeout(function() {
						sv_cmd = "22*";
						conn.connect(params);
						//client.start();
					}, 20000);
				}
				if (dnow >= dstart && dnow <= dend ){ //Einspeisung und Leistungsdaten werden nur im Interval eingelesen
					sv_cmd = "00*"; //pvig
					conn.connect(params);
					//client.start();
					if (gthis.config.d0converter == true){
						setTimeout(function() {
							sv_cmd = "21*";
							conn.connect(params);
							//client.start();
						}, 10000);
					}
					if (gthis.config.pvi1 == true){
						setTimeout(function() {
							sv_cmd = "01*"; //pvi1 Wechselrichter 1
							conn.connect(params);
						}, 29000);
					}
					if (gthis.config.pvi2 == true){
						setTimeout(function() {
							sv_cmd = "02*";
							conn.connect(params);
						}, 38000);
					}
					if (gthis.config.pvi3 == true){
						setTimeout(function() {
							sv_cmd = "03*";
							conn.connect(params);
						}, 47000);
					}
					if (gthis.config.pvi4 == true){
						setTimeout(function() {
							sv_cmd = "04*";
							conn.connect(params);
						}, 56000);
					}
				}
			});
		  
		} catch (err) {
			this.log.error('Error cron-parser: ' + err.message);
		}			
		
		conn.on('connect', function() {
		  gthis.log.info('socket connect! Cmd = ' + sv_cmd);
		  conn.send(sv_cmd, function(err, response) {
			if (response == null){
				gthis.log.warn("connect: cann't read data from tcp-server!" );    
			}else{
				sv_data = response.toString();               	//daten in globale variable sv_data ablegen
				gthis.log.info("data: " + sv_data);    
				sv_data = sv_data.replace (/[{]+/,"");      // "{" entfernen
				sv_data = sv_data.replace (/[}]+/,"");      // "}" entfernen
				sv_data = sv_data.split(",");   			// split von sv_data in array
				var sv_prefix = "";
				var csum = calcChecksum(response); //Checksumme berechnen
				gthis.log.info("checksum: " + sv_data[sv_data.length-1]);
				gthis.log.info("checksum: " + sv_data[sv_data.length-1].charCodeAt(0));
				gthis.log.info("calculated checksum: " + csum);
				if (sv_data[sv_data.length-1].charCodeAt(0) == csum || sv_data[0] == "00"){
					switch(sv_data[0]){
						case "00": sv_prefix = "pvig.";
						break;
						case "01": sv_prefix = "pvi1.";
						break;
						case "02": sv_prefix = "pvi2.";
						break;
						case "03": sv_prefix = "pvi3.";
						break;
						case "04": sv_prefix = "pvi4.";
						break;
						case "21": sv_prefix = "d0supply.";
						break;
						case "22": sv_prefix = "d0consumption.";
						break;
					}
					//sv_data 00: WR, Tag, Monat, Jahr, Stunde, Minute, KDY, KMT, KYR, KT0,PAC, UDC, IDC, UDCB, IDCB, UDCC, IDCC, UL1, IL1, TKK
					//{21,17,04,2015,16,21,0030.1,00459,001182,00001182,03290,000,000.0,000,000.0,000,000.0,000,000.0,00},!
					// Tagesertrag= 30.1, Monatsertrag=495, Jahresertrag=1182, Gesamtertrag=1182 kWh., Leistung=3290W
					
					var value = Number(sv_data[10]);
					gthis.setStateAsync(sv_prefix + "actualy", { val: value, ack: true });
					if (sv_prefix == "pvig.") {
					  if (gthis.config.setCCU == true){
						gthis.log.info("write CCU system variable: " + gthis.config.CCUSystemV);
						gthis.setForeignState(gthis.config.CCUSystemV,{ val: value, ack: false});				  
					  }
					}
					
					value = Number(sv_data[6]);
					gthis.setStateAsync(sv_prefix + "daily", { val: value, ack: true });
					
					value = Number(sv_data[7]);
					gthis.setStateAsync(sv_prefix + "monthly", { val: value, ack: true });
					
					value = Number(sv_data[8]);
					gthis.setStateAsync(sv_prefix + "yearly", { val: value, ack: true });
					
					value = Number(sv_data[9]);
					gthis.setStateAsync(sv_prefix + "total", { val: value, ack: true });		

					var sDate = Number(sv_data[3]) + "-" + Number(sv_data[2]) + "-" + Number(sv_data[1]) + " " + Number(sv_data[4]) + ":" + Number(sv_data[5])
					gthis.setStateAsync(sv_prefix + "lastupdate", { val: sDate, ack: true });		
					
					if (sv_prefix == 'pvi1.' || sv_prefix == 'pvi2.' || sv_prefix == 'pvi3.' || sv_prefix == 'pvi4.'){
						value = Number(sv_data[11]);
						gthis.setStateAsync(sv_prefix + "udc", { val: value, ack: true });		
						value = Number(sv_data[12]);
						gthis.setStateAsync(sv_prefix + "idc", { val: value, ack: true });		
						value = Number(sv_data[13]);
						gthis.setStateAsync(sv_prefix + "udcb", { val: value, ack: true });		
						value = Number(sv_data[14]);
						gthis.setStateAsync(sv_prefix + "idcb", { val: value, ack: true });		
						value = Number(sv_data[15]);
						gthis.setStateAsync(sv_prefix + "udcc", { val: value, ack: true });		
						value = Number(sv_data[16]);
						gthis.setStateAsync(sv_prefix + "idcc", { val: value, ack: true });	
						if (sv_data.length == 27) { //neue Version Solarview
							value = Number(sv_data[19]);
							gthis.setStateAsync(sv_prefix + "ul1", { val: value, ack: true });		
							value = Number(sv_data[20]);
							gthis.setStateAsync(sv_prefix + "il1", { val: value, ack: true });		
							value = Number(sv_data[21]);
							gthis.setStateAsync(sv_prefix + "ul2", { val: value, ack: true });		
							value = Number(sv_data[22]);
							gthis.setStateAsync(sv_prefix + "il2", { val: value, ack: true });		
							value = Number(sv_data[23]);
							gthis.setStateAsync(sv_prefix + "ul3", { val: value, ack: true });		
							value = Number(sv_data[24]);
							gthis.setStateAsync(sv_prefix + "il3", { val: value, ack: true });		
							value = Number(sv_data[25]);
							gthis.setStateAsync(sv_prefix + "tkk", { val: value, ack: true });		
						}
						if (sv_data.length === 23) { //alte Version Solarview
							value = Number(sv_data[19]);
							gthis.setStateAsync(sv_prefix + "ul1", { val: value, ack: true });		
							value = Number(sv_data[20]);
							gthis.setStateAsync(sv_prefix + "il1", { val: value, ack: true });		
							value = Number(sv_data[21]);
							gthis.setStateAsync(sv_prefix + "tkk", { val: value, ack: true });							
						}
					}
				}else{
					gthis.log.error("connect: checksum error")
				}
				gthis.log.info("connect: end" );    
			}
		  });
		})
		
		conn.on('timeout', function() {
		  gthis.log.warn('socket timeout!');
		  conn.end();
		})
		 
		conn.on('close', function() {
		  gthis.log.info('connection closed');
		})		
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info("cleaned everything up...");
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			this.log.info(`object ${id} deleted`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.message" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Solarviewdatareader(options);
} else {
	// otherwise start the instance directly
	new Solarviewdatareader();
}