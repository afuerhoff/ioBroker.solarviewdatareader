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
const netcat = require('node-netcat');
//const telnet = require('telnet-client');
var parser = require('cron-parser');

var gthis; 
var sv_data;
var sv_cmd = "00*";
var conn;

// Nullen voranstellen - add Leading Zero
function aLZ(n){
  if(n <= 9){
    return "0" + n;
  }
  return n
}

function calcChecksum(string) {
	var buf = new Buffer(string);
	// Calculate the modulo 256 checksum
	var sum = 0;
	for (var i = 0, l = buf.length-4; i < l; i++) {
		sum = (sum + buf[i]) % 128;
	}
	return sum;
}

function d2h(d) {
    return d.toString(16);
}

function stringToHex (tmp) {
    var str = '',
        i = 0,
        tmp_len = tmp.length,
        c;
 
    for (; i < tmp_len; i += 1) {
        c = tmp.charCodeAt(i);
        str += d2h(c) + ' ';
    }
    return str;
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

		this.log.info("ip-address: " + ip_address + ":" + port);
		//this.log.info("port: " + this.config.port);
		this.log.info("d0 converter: " + this.config.d0converter.toString());

		/*
		For every state in the system there has to be also an object of type state
		*/
		
		//Datenobjekte erzeugen
		await gthis.setObjectAsync("lastupdate", {
			type: "state",
			common: {
				name: "last connect date",
				type: "text",
				role: "indicator",
				unit: "",
				read: true,
				write: false,
			},
			native: {},
		});

		var arrTcp = [];
		var arrTcpLen = arrTcp.push("pvig"); // PV Gesamtanlage
		if (gthis.config.d0converter == true){ //d0converter hinzufügen
			arrTcp.push("d0supply"); //Einspeisezähler
			arrTcpLen = arrTcp.push("d0consumption"); //Verbrauchszähler
		}
		const arrDp1 = ['current', 'daily', 'monthly', 'yearly', 'total']; //Datenpunkte
		const arrType1 = ['number', 'number', 'number', 'number', 'number']; //Datentypen
		const arrUnit1 = ['W', 'kWh', 'kWh', 'kWh', 'kWh']; // Einheiten
		var arrDpLen = arrDp1.length;
		for (var i = 0; i < arrTcpLen; i++) { // normale Datenpunkte
			for (var dp = 0; dp < arrDpLen; dp++) {
				//gthis.log.info("create object: " + arrTcp[i] + "." + arrDp1[dp]); // Anlage Datenobjekte loggen
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
		//gthis.log.info("len: " + arrInvLen);
		for (var i = 0; i < arrInvLen; i++) { // Datenpunkte für Wechselrichter anlegen
			for (var dp = 0; dp < arrDpLen; dp++) {
				//gthis.log.info("create object: " + arrInv[i] + "." + arrDp[dp]);
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

		//conn = new telnet();

		//telnet parameters
		var params = {
		  host: ip_address,
		  debug: false,
		  shellPrompt: ';-)', // '/ #',
		  timeout: 3000
		};

		//netcat parameters
		var params = {
		  timeout: 3000,
		  read_encoding: 'buffer'
		};
		conn = netcat.client(port, ip_address, params);
		
		try {
			var interval = parser.parseExpression(this.config.interval);
			//this.log.info("CRON string: " + this.config.interval);
			//this.log.info('Date: ', interval.next().toString());
			this.log.info("CRON: " + this.config.interval + " (" + this.config.intervalstart + " to " + this.config.intervalend + ")");
			//this.log.info("interval end: " + this.config.intervalend);
			var j = schedule.scheduleJob(this.config.interval, function(){
				const dnow = new Date();
				var dstart = new Date(dnow.getFullYear() + "-" + (dnow.getMonth()+1) + "-" + dnow.getDate() + " " + starttime);
				var dend = new Date(dnow.getFullYear() + "-" + (dnow.getMonth()+1) + "-" + dnow.getDate() + " " + endtime);
				if (gthis.config.d0converter == true){ //Verbrauch wird immer eingelesen
					setTimeout(function() {
						sv_cmd = "22*";
						//conn.connect(params);
						conn.start();
					}, 20000);
				}
				if (dnow >= dstart && dnow <= dend ){ //Einspeisung und Leistungsdaten werden nur im Interval eingelesen
					sv_cmd = "00*"; //pvig
					//conn.connect(params);
					conn.start();
					if (gthis.config.d0converter == true){
						setTimeout(function() {
							sv_cmd = "21*";
							//conn.connect(params);
							conn.start();
						}, 10000);
					}
					if (gthis.config.pvi1 == true){
						setTimeout(function() {
							sv_cmd = "01*"; //pvi1 Wechselrichter 1
							//conn.connect(params);
							conn.start();
						}, 29000);
					}
					if (gthis.config.pvi2 == true){
						setTimeout(function() {
							sv_cmd = "02*";
							//conn.connect(params);
							conn.start();
						}, 38000);
					}
					if (gthis.config.pvi3 == true){
						setTimeout(function() {
							sv_cmd = "03*";
							//conn.connect(params);
							conn.start();
						}, 47000);
					}
					if (gthis.config.pvi4 == true){
						setTimeout(function() {
							sv_cmd = "04*";
							//conn.connect(params);
							conn.start();
						}, 56000);
					}
				}
			});
		  
		} catch (err) {
			this.log.error('Error cron-parser: ' + err.message);
		}			
		
		conn.on('open', function(){
		  conn.send(sv_cmd);
		});
		
		//conn.on('connect', function() {
		conn.on('data', function(response) {
		  //gthis.log.info('socket connect! Cmd = ' + sv_cmd);
		  //conn.send(sv_cmd, function(err, response) {
			if (response == null){
				gthis.log.warn("connect: cann't read data from tcp-server!" );    
			}else{
				sv_data = response.toString('ascii'); //Daten in globale variable sv_data ablegen
				sv_data = sv_data.replace (/[{]+/,"");      // "{" entfernen
				sv_data = sv_data.replace (/[}]+/,"");      // "}" entfernen
				sv_data = sv_data.split(",");   			// split von sv_data in array
				var csum = calcChecksum(response.toString('ascii')); //Checksumme berechnen
				var sv_prefix = "";
				if (sv_data[sv_data.length-1].charCodeAt(0) == csum ){
					gthis.log.info(sv_cmd + ": " + response.toString('ascii') + " -> chksum ok" );    
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
					// Quelle S. 45: http://www.solarview.info/solarview-fb_Installieren.pdf
					//WR, Tag, Monat, Jahr, Stunde, Minute, KDY, KMT, KYR, KT0,PAC, UDC, IDC, UDCB, IDCB, UDCC, IDCC, UL1, IL1, UL2, IL2, UL3, IL3, TKK
					/*KDY= Tagesertrag (kWh)
					KMT= Monatsertrag (kWh)
					KYR= Jahresertrag (kWh)
					KT0= Gesamtertrag (kWh)
					PAC= Generatorleistung in W
					UDC, UDCB, UDCC = Generator-Spannungen in Volt pro MPP-Tracker IDC,
					IDCB, IDCC = Generator-Ströme in Ampere pro MPP-Tracker
					UL1, IL1 = Netzspannung, Netzstrom Phase 1
					UL2, IL2 = Netzspannung, Netzstrom Phase 2
					UL3, IL3 = Netzspannung, Netzstrom Phase 3
					TKK= Temperatur Wechselrichter */
					
					var value = Number(sv_data[10]);
					gthis.setStateAsync(sv_prefix + "current", { val: value, ack: true });
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

					var sDate = Number(sv_data[3]) + "-" + aLZ(Number(sv_data[2])) + "-" + aLZ(Number(sv_data[1])) + " " + aLZ(Number(sv_data[4])) + ":" + aLZ(Number(sv_data[5]))
					gthis.setStateAsync("lastupdate", { val: sDate, ack: true });		
					
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
				conn.send();
				//gthis.log.info("connect: end" );    
			}
		  //});
		})
		
		/*conn.on('timeout', function() {
		  gthis.log.warn('socket timeout!');
		  conn.end();
		})*/

		conn.on('error', function(err) {
		  gthis.log.info('error: ' + err);
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
			//this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			//this.log.info(`state ${id} deleted`);
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