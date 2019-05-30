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

var gthis = 0; //Global verfügbar machen
var sv_data;
var sv_cmd = "00*";
var sv_array = ['PV.', 'D0supply.', 'D0consumption.'];

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
		gthis = this;
		const ip_address = this.config.ipaddress;
		const port = this.config.port;

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.log.info("ipadress: " + this.config.ipadress);
		this.log.info("port: " + this.config.port);

		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		sv_array.forEach(async function(element) {
			gthis.log.info("Create object: " + element + "Actualy");
			await gthis.setObjectAsync(element + "Actualy", {
				type: "state",
				common: {
					name: "Actualy",
					type: "number",
					role: "indicator",
					unit: "W",
					read: true,
					write: false,
				},
				native: {},
			});
			gthis.log.info("Create object: " + element + "Daily");
			await gthis.setObjectAsync(element + "Daily", {
				type: "state",
				common: {
					name: "Daily",
					type: "number",
					role: "indicator",
					unit: "kWh",
					read: true,
					write: false,
				},
				native: {},
			});
			gthis.log.info("Create object: " + element + "Monthly");
			await gthis.setObjectAsync(element + "Monthly", {
				type: "state",
				common: {
					name: "Monthly",
					type: "number",
					role: "indicator",
					unit: "kWh",
					read: true,
					write: false,
				},
				native: {},
			});
			gthis.log.info("Create object: " + element + "Yearly");
			await gthis.setObjectAsync(element + "Yearly", {
				type: "state",
				common: {
					name: "Yearly",
					type: "number",
					role: "indicator",
					unit: "kWh",
					read: true,
					write: false,
				},
				native: {},
			});
			gthis.log.info("Create object: " + element + "Total");
			await gthis.setObjectAsync(element + "Total", {
				type: "state",
				common: {
					name: "Total",
					type: "number",
					role: "indicator",
					unit: "kWh",
					read: true,
					write: false,
				},
				native: {},
			});
			gthis.log.info("Create object: " + element + "LastUpdate");
			await gthis.setObjectAsync(element + "LastUpdate", {
				type: "state",
				common: {
					name: "LastUpdate",
					type: "date",
					role: "indicator",
					unit: "",
					read: true,
					write: false,
				},
				native: {},
			});			
		});
		
		// in this template all states changes inside the adapters namespace are subscribed
		this.subscribeStates("*");

		const starttime = this.config.intervalstart;
		const endtime   = this.config.intervalend;

		var client = netcat.client(port, ip_address);
		this.log.info(this.config.interval);
		this.log.info(this.config.intervalstart);
		this.log.info(this.config.intervalend);
		this.log.info(this.config.d0converter);
		this.log.info(this.config.s0converter);

		var j = schedule.scheduleJob(this.config.interval, function(){
			const dnow = new Date();
			var dstart = new Date(dnow.getFullYear() + "-" + (dnow.getMonth()+1) + "-" + dnow.getDate() + " " + starttime);
			gthis.log.info(dstart.toDateString());
			var dend = new Date(dnow.getFullYear() + "-" + (dnow.getMonth()+1) + "-" + dnow.getDate() + " " + endtime);
			gthis.log.info(dend.toDateString());
			if (dnow >= dstart && dnow <= dend ){
				sv_cmd = "00*";
				client.start();     //SolarView abfragen
				if (gthis.config.d0converter == true){
					setTimeout(function() {
						sv_cmd = "21*";
						client.start()
					}, 3000);
					setTimeout(function() {
						sv_cmd = "22*";
						client.start() 
					}, 6000);
				}
			}
		});
		
		client.on('open', function (){
			gthis.log.info('connected');
			sv_data = "";
			gthis.log.info("send " + sv_cmd);
			client.send(sv_cmd, false);                 		//SolarView command: Abruf der Daten der gesamten Anlage *00
		});

	    client.on('data',function  (data) {       		//empfangene daten
			sv_data = data.toString();               	//daten in globale variable sv_data ablegen
			gthis.log.info("client.on: " + sv_data);    
			sv_data = sv_data.replace (/[{]+/,"");      // "{" entfernen
            sv_data = sv_data.replace (/[}]+/,"");      // "}" entfernen
            sv_data = sv_data.split(",");   			// split von sv_data in array
			var sv_prefix = "";
			switch(sv_data[0]){
				case "00": sv_prefix = "PV.";
				break;
				case "21": sv_prefix = "D0supply.";
				break;
				case "22": sv_prefix = "D0consumption.";
				break;
			}
			//sv_data 00: WR, Tag, Monat, Jahr, Stunde, Minute, KDY, KMT, KYR, KT0,PAC, UDC, IDC, UDCB, IDCB, UDCC, IDCC, UL1, IL1, TKK
			//{21,17,04,2015,16,21,0030.1,00459,001182,00001182,03290,000,000.0,000,000.0,000,000.0,000,000.0,00},!
			// Tagesertrag= 30.1, Monatsertrag=495, Jahresertrag=1182, Gesamtertrag=1182 kWh., Leistung=3290W
			var value = Number(sv_data[10]);
			gthis.setStateAsync(sv_prefix + "PAC", { val: value, ack: true });
			
			value = Number(sv_data[6]);
			gthis.setStateAsync(sv_prefix + "DailyYield", { val: value, ack: true });
			
			value = Number(sv_data[7]);
			gthis.setStateAsync(sv_prefix + "MonthlyYield", { val: value, ack: true });
			
			value = Number(sv_data[8]);
			gthis.setStateAsync(sv_prefix + "YearlyYield", { val: value, ack: true });
			
			value = Number(sv_data[9]);
			gthis.setStateAsync(sv_prefix + "TotalYield", { val: value, ack: true });		

			var sDate = Number(sv_data[3]) + "-" + Number(sv_data[2]) + "-" + Number(sv_data[1]) + " " + Number(sv_data[4]) + ":" + Number(sv_data[5])
			gthis.setStateAsync(sv_prefix + "LastUpdate", { val: sDate, ack: true });		

			client.send();
		});

		client.on('error', function (err) {
			gthis.log.error(err);
		});

		client.on('close', function () {
		  gthis.log.info('close');
		});	
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