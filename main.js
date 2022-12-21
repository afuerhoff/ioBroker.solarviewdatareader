'use strict';

/*
 * Created with @iobroker/create-adapter v1.14.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const net = require('net');

let gthis; 
let sv_data;
let sv_cmd = '00*';
let conn;
let jobSchedule;
//Timeout
let to1, to2, to3, to4, to5, to6, to7, to8, to9, to10, to11;

// Nullen voranstellen - add Leading Zero
function aLZ(n){
    if(n <= 9){
        return '0' + n;
    }
    return n;
}

function calcChecksum(string) {
    // Calculate the modulo checksum
    const buf = new Buffer(string);
    let sum = 0;
    let ind = 0;
    const obj = {'result': false, 'chksum': 0, 'ind': 0, 'data': buf};

    for (let i = 0, l = buf.length; i < l; i++) {
        sum = (sum + buf[i]) % 128;
        if (buf[i] == 125) {
            ind = i + 2;
            obj.ind = ind;
            obj.chksum = sum;
            break;
        }
    }
    if (buf[ind] == sum){
        obj.result = true;
    }else{
        obj.result = false;
    }
    return obj;
}

async function createGlobalObjects(that) {
    const opt = [
        //id, type, name, type, role, def, rd, wr, desc 
        //common.type (optional - (default is mixed==any type) (possible values: number, string, boolean, array, object, mixed, file)
        ['info.connection', 'state', 'connection', 'boolean', 'indicator.connected', false, true, false, 'Solarview connection state'],
        ['info.lastUpdate', 'state', 'lastUpdate', 'string', 'date', (new Date('1900-01-01T00:00:00')).toString(), true, false, 'Last connection date/time'],
    ];

    for(let i=0; i < opt.length; i++) { 
        await that.setObjectNotExists(opt[i][0], {
            type: opt[i][1],
            common: {
                name: opt[i][2],
                type: opt[i][3],
                role: opt[i][4],
                def: opt[i][5],
                read: opt[i][6],
                write: opt[i][7],
                desc: opt[i][8],
            },
            native: {},
        });
        if (await that.getStateAsync(opt[i][0]) == null) that.setState(opt[i][0], opt[i][5], true); //set default
    }
}

async function createSolarviewObjects(that, device, additional) {
    let opt = [
        //id, type, name, type, role, def, rd, wr, desc 
        //common.type (optional - (default is mixed==any type) (possible values: number, string, boolean, array, object, mixed, file)
        [device + '.current', 'state', 'current', 'number', 'value', 0, true, false, 'Current PAC','W'],
        [device + '.daily', 'state', 'daily', 'number', 'value', 0, true, false, 'Daily yield', 'kWh'],
        [device + '.monthly', 'state', 'monthly', 'number', 'value', 0, true, false, 'Monthly yield', 'kWh'],
        [device + '.yearly', 'state', 'yearly', 'number', 'value', 0, true, false, 'Yearly yield', 'kWh'],
        [device + '.total', 'state', 'total', 'number', 'value', 0, true, false, 'Total yield', 'kWh']
    ];
    if (additional == true){
        const opt2 = [
            [device + '.udc', 'state', 'udc', 'number', 'value', 0, true, false, 'Generator voltage','V'],
            [device + '.idc', 'state', 'idc', 'number', 'value', 0, true, false, 'Generator current','A'],
            [device + '.udcb', 'state', 'udcb', 'number', 'value', 0, true, false, 'Generator voltage','V'],
            [device + '.idcb', 'state', 'idcb', 'number', 'value', 0, true, false, 'Generator current','A'],
            [device + '.udcc', 'state', 'udcc', 'number', 'value', 0, true, false, 'Generator voltage','V'],
            [device + '.idcc', 'state', 'idcc', 'number', 'value', 0, true, false, 'Generator current','A'],
            [device + '.udcd', 'state', 'udcd', 'number', 'value', 0, true, false, 'Generator voltage','V'],
            [device + '.idcd', 'state', 'idcd', 'number', 'value', 0, true, false, 'Generator current','A'],
            [device + '.ul1', 'state', 'ul1', 'number', 'value', 0, true, false, 'Mains voltage','V'],
            [device + '.il1', 'state', 'il1', 'number', 'value', 0, true, false, 'Mains current','A'],
            [device + '.ul2', 'state', 'ul2', 'number', 'value', 0, true, false, 'Mains voltage','V'],
            [device + '.il2', 'state', 'il2', 'number', 'value', 0, true, false, 'Mains current','A'],
            [device + '.ul3', 'state', 'ul3', 'number', 'value', 0, true, false, 'Mains voltage','V'],
            [device + '.il3', 'state', 'il3', 'number', 'value', 0, true, false, 'Mains current','A'],
            [device + '.tkk', 'state', 'tkk', 'number', 'value', 0, true, false, 'Temperature','°C']
        ];
        opt = opt.concat(opt2);
    }

    for(let i=0; i < opt.length; i++) { 
        await that.setObjectNotExists(opt[i][0], {
            type: opt[i][1],
            common: {
                name: opt[i][2],
                type: opt[i][3],
                role: opt[i][4],
                def: opt[i][5],
                read: opt[i][6],
                write: opt[i][7],
                desc: opt[i][8],
                unit: opt[i][9],
            },
            native: {},
        });
        if (await that.getStateAsync(opt[i][0]) == null) that.setState(opt[i][0], opt[i][5], true); //set default
    }
}

async function getData(port, ip_address) {
    const starttime = gthis.config.intervalstart;
    let endtime   = gthis.config.intervalend;
    if (endtime == '00:00') endtime = '23:59';
    const dnow = new Date();
    const dstart = new Date(dnow.getFullYear() + '-' + (dnow.getMonth()+1) + '-' + dnow.getDate() + ' ' + starttime);
    const dend = new Date(dnow.getFullYear() + '-' + (dnow.getMonth()+1) + '-' + dnow.getDate() + ' ' + endtime);
    let timeoutCnt = 0;
    if (gthis.config.d0converter == true){ //Verbrauch wird immer eingelesen
        timeoutCnt += 500;
        to1 = setTimeout(function() {
            sv_cmd = '22*';
            conn.connect(port, ip_address, function() {
                conn.write('22*');
                conn.end();
            });
        }, timeoutCnt);
    }

    if (gthis.config.scm0 == true){
        timeoutCnt += 500;
        to7 = setTimeout(function() {
            sv_cmd = '10*'; //pvi1 Wechselrichter 1
            conn.connect(port, ip_address, function() {
                conn.write(sv_cmd);
                conn.end();
            });
        }, timeoutCnt);
    }
    if (gthis.config.scm1 == true){
        timeoutCnt += 500;
        to8 = setTimeout(function() {
            sv_cmd = '11*';
            conn.connect(port, ip_address, function() {
                conn.write(sv_cmd);
                conn.end();
            });
        }, timeoutCnt);
    }
    if (gthis.config.scm2 == true){
        timeoutCnt += 500;
        to9 = setTimeout(function() {
            sv_cmd = '12*';
            conn.connect(port, ip_address, function() {
                conn.write(sv_cmd);
                conn.end();
            });
        }, timeoutCnt);
    }
    if (gthis.config.scm3 == true){
        timeoutCnt += 500;
        to10 = setTimeout(function() {
            sv_cmd = '13*';
            conn.connect(port, ip_address, function() {
                conn.write(sv_cmd);
                conn.end();
            });
        }, timeoutCnt);
    }
    if (gthis.config.scm4 == true){
        timeoutCnt += 500;
        to11 = setTimeout(function() {
            sv_cmd = '14*';
            conn.connect(port, ip_address, function() {
                conn.write(sv_cmd);
                conn.end();
            });
        }, timeoutCnt);
    }

    if (dnow >= dstart && dnow <= dend ){ //Einspeisung und Leistungsdaten werden nur im Interval eingelesen
        sv_cmd = '00*'; //pvig
        conn.connect(port, ip_address, function() {
            conn.write(sv_cmd);
            conn.end();
        });
        if (gthis.config.d0converter == true){
            timeoutCnt += 500;
            to2 = setTimeout(function() {
                sv_cmd = '21*';
                conn.connect(port, ip_address, function() {
                    conn.write(sv_cmd);
                    conn.end();
                });
            }, timeoutCnt);
        }
        if (gthis.config.pvi1 == true){
            timeoutCnt += 500;
            to3 = setTimeout(function() {
                sv_cmd = '01*'; //pvi1 Wechselrichter 1
                conn.connect(port, ip_address, function() {
                    conn.write(sv_cmd);
                    conn.end();
                });
            }, timeoutCnt);
        }
        if (gthis.config.pvi2 == true){
            timeoutCnt += 500;
            to4 = setTimeout(function() {
                sv_cmd = '02*';
                conn.connect(port, ip_address, function() {
                    conn.write(sv_cmd);
                    conn.end();
                });
            }, timeoutCnt);
        }
        if (gthis.config.pvi3 == true){
            timeoutCnt += 500;
            to5 = setTimeout(function() {
                sv_cmd = '03*';
                conn.connect(port, ip_address, function() {
                    conn.write(sv_cmd);
                    conn.end();
                });
            }, timeoutCnt);
        }
        if (gthis.config.pvi4 == true){
            timeoutCnt += 500;
            to6 = setTimeout(function() {
                sv_cmd = '04*';
                conn.connect(port, ip_address, function() {
                    conn.write(sv_cmd);
                    conn.end();
                });
            }, timeoutCnt);
        }
    }
}

class Solarviewdatareader extends utils.Adapter {

    /**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
    constructor(options) {
        super({
            ...options,
            name: 'solarviewdatareader',
        });
        this.on('ready', this.onReady.bind(this));
        //this.on('objectChange', this.onObjectChange.bind(this));
        //this.on('stateChange', this.onStateChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        gthis = this;
    }
	
    /**
	 * Is called when databases are connected and adapter received configuration.
	 */
    async onReady() {
        // Initialize your adapter here
        // Konfiguration lesen und als Info ausgeben
        const ip_address = this.config.ipaddress;
        const port = this.config.port;
        let chkCnt = 0;

        this.log.info('start solarview ' + ip_address + ':' + port + ' - polling interval: ' + this.config.intervalVal + ' s (' + this.config.intervalstart + ' to ' + this.config.intervalend + ')');
        this.log.info('d0 converter: ' + this.config.d0converter.toString());

        //Workaround for interval change to seconds
        const adapterObj = (await this.getForeignObjectAsync(`system.adapter.${this.namespace}`));
        let adapterObjChanged = false; //for changes
        
        if (this.config.interval_seconds === false) { //Workaround: Switch interval to seconds
            this.log.warn('Interval changed to seconds!');
            adapterObj.native.interval_seconds = true;
            adapterObj.native.intervalVal = adapterObj.native.intervalVal * 60;
            adapterObjChanged = true;
        }

        if (adapterObjChanged === true){ //Save changes
            this.log.info('Interval attribute changed! Please check the configuration');
            this.log.info('Adapter restarts');
            await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
        }


        //Datenobjekte erzeugen
        await createGlobalObjects(gthis);
        await createSolarviewObjects(gthis, 'pvig');
        if (gthis.config.d0converter == true){ //d0converter hinzufügen
            await createSolarviewObjects(gthis, 'd0supply', false);
            await createSolarviewObjects(gthis, 'd0consumption', false);
        }
        for (let inv = 1; inv < 5; inv++) { // zusätzliche Datenobjekte für Wechselrichter
            if (eval('gthis.config.pvi' + inv) == true){
                this.log.info('photovoltaic inverter ' + inv + ' enabled');
                await createSolarviewObjects(gthis, 'pvi' + inv, true);
            }
        }
        //Self consumption meter 0, 1-4
        for (let inv = 0; inv < 5; inv++) { // zusätzliche Datenobjekte für Wechselrichter
            if (eval('gthis.config.scm' + inv) == true){
                this.log.info('self consumption meter ' + inv + ' enabled');
                await createSolarviewObjects(gthis, 'scm' + inv, false);
            }
        }

        // in this template all states changes inside the adapters namespace are subscribed
        //this.subscribeStates('*');

        conn = new net.Socket();
		
        const cron = this.config.intervalVal * 1000;
        try {
            getData(port, ip_address);
            jobSchedule = setInterval(async function(){
                getData(port, ip_address);
            }, cron);		  
        } catch (err) {
            this.log.error('schedule: ' + err.message);
        }			
		
        conn.on('data', async function(response) {
            try {
                if (response == null){
                    gthis.log.error("connect: cann't read data from tcp-server!" );
                    gthis.setStateChanged('info.connection', { val: false, ack: true });  
                }else{
                    gthis.setStateChanged('info.connection', { val: true, ack: true });
                    sv_data = response.toString('ascii'); //Daten in globale variable sv_data ablegen
                    sv_data = sv_data.replace (/[{]+/,'');      // "{" entfernen
                    sv_data = sv_data.replace (/[}]+/,'');      // "}" entfernen
                    sv_data = sv_data.split(',');   			// split von sv_data in array
                    const csum = calcChecksum(response.toString('ascii')); //Checksumme berechnen
                    let sv_prefix = '';
                    const log = true;
                    if (csum.result == true && log == true){
                        chkCnt = 0;
                        gthis.log.debug(sv_cmd + ': ' + response.toString('ascii'));
                        switch(sv_data[0]){
                            case '00': sv_prefix = 'pvig.';
                                break;
                            case '01': sv_prefix = 'pvi1.';
                                break;
                            case '02': sv_prefix = 'pvi2.';
                                break;
                            case '03': sv_prefix = 'pvi3.';
                                break;
                            case '04': sv_prefix = 'pvi4.';
                                break;
                            case '10': sv_prefix = 'scm0.';
                                break;
                            case '11': sv_prefix = 'scm1.';
                                break;
                            case '12': sv_prefix = 'scm2.';
                                break;
                            case '13': sv_prefix = 'scm3.';
                                break;
                            case '14': sv_prefix = 'scm4.';
                                break;
                            case '21': sv_prefix = 'd0supply.';
                                break;
                            case '22': sv_prefix = 'd0consumption.';
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
                        
                        let value = Number(sv_data[10]);
                        gthis.setStateChanged(sv_prefix + 'current', { val: value, ack: true });
                        if (sv_prefix == 'pvig.') {
                            if (gthis.config.setCCU == true){
                                const obj = await gthis.findForeignObjectAsync(gthis.config.CCUSystemV);
                                if (obj.id){
                                    gthis.log.debug('set CCU system variable: ' + gthis.config.CCUSystemV);
                                    gthis.setForeignState(gthis.config.CCUSystemV,{ val: value, ack: false});	
                                }else{
                                    gthis.log.error('CCU system variable ' + gthis.config.CCUSystemV + ' does not exist!');
                                }		  
                            }
                        }
                        
                        value = Number(sv_data[6]);
                        gthis.setStateChanged(sv_prefix + 'daily', { val: value, ack: true });
                        
                        value = Number(sv_data[7]);
                        gthis.setStateChanged(sv_prefix + 'monthly', { val: value, ack: true });
                        
                        value = Number(sv_data[8]);
                        gthis.setStateChanged(sv_prefix + 'yearly', { val: value, ack: true });
                        
                        value = Number(sv_data[9]);
                        gthis.setStateChanged(sv_prefix + 'total', { val: value, ack: true });		

                        const sDate = Number(sv_data[3]) + '-' + aLZ(Number(sv_data[2])) + '-' + aLZ(Number(sv_data[1])) + ' ' + aLZ(Number(sv_data[4])) + ':' + aLZ(Number(sv_data[5]));
                        gthis.setStateChanged('info.lastUpdate', { val: sDate, ack: true });		
                        
                        if (sv_prefix == 'pvi1.' || sv_prefix == 'pvi2.' || sv_prefix == 'pvi3.' || sv_prefix == 'pvi4.'){
                            value = Number(sv_data[11]);
                            gthis.setStateChanged(sv_prefix + 'udc', { val: value, ack: true });		
                            value = Number(sv_data[12]);
                            gthis.setStateChanged(sv_prefix + 'idc', { val: value, ack: true });		
                            value = Number(sv_data[13]);
                            gthis.setStateChanged(sv_prefix + 'udcb', { val: value, ack: true });		
                            value = Number(sv_data[14]);
                            gthis.setStateChanged(sv_prefix + 'idcb', { val: value, ack: true });		
                            value = Number(sv_data[15]);
                            gthis.setStateChanged(sv_prefix + 'udcc', { val: value, ack: true });		
                            value = Number(sv_data[16]);
                            gthis.setStateChanged(sv_prefix + 'idcc', { val: value, ack: true });	
                            value = Number(sv_data[17]);
                            gthis.setStateChanged(sv_prefix + 'udcd', { val: value, ack: true });	
                            value = Number(sv_data[18]);
                            gthis.setStateChanged(sv_prefix + 'idcd', { val: value, ack: true });	
                            if (sv_data.length == 27) { //neue Version Solarview
                                value = Number(sv_data[19]);
                                gthis.setStateChanged(sv_prefix + 'ul1', { val: value, ack: true });		
                                value = Number(sv_data[20]);
                                gthis.setStateChanged(sv_prefix + 'il1', { val: value, ack: true });		
                                value = Number(sv_data[21]);
                                gthis.setStateChanged(sv_prefix + 'ul2', { val: value, ack: true });		
                                value = Number(sv_data[22]);
                                gthis.setStateChanged(sv_prefix + 'il2', { val: value, ack: true });		
                                value = Number(sv_data[23]);
                                gthis.setStateChanged(sv_prefix + 'ul3', { val: value, ack: true });		
                                value = Number(sv_data[24]);
                                gthis.setStateChanged(sv_prefix + 'il3', { val: value, ack: true });		
                                value = Number(sv_data[25]);
                                gthis.setStateChanged(sv_prefix + 'tkk', { val: value, ack: true });		
                            }
                            if (sv_data.length === 23) { //alte Version Solarview
                                value = Number(sv_data[19]);
                                gthis.setStateChanged(sv_prefix + 'ul1', { val: value, ack: true });		
                                value = Number(sv_data[20]);
                                gthis.setStateChanged(sv_prefix + 'il1', { val: value, ack: true });		
                                value = Number(sv_data[21]);
                                gthis.setStateChanged(sv_prefix + 'tkk', { val: value, ack: true });							
                            }
                        }
                    }else{
                        chkCnt += 1;
                        if(chkCnt > 0 && csum.chksum != 0){
                            //const buf = csum.data;
                            const buf = new Buffer(response.toString('ascii'));
                            gthis.log.warn('checksum not correct! <' + buf[csum.ind-1] + ' ' + buf[csum.ind] + ' ' + buf[csum.ind+1] + ' ' + buf[csum.ind+2] + '   ' + csum.chksum + '>');
                            gthis.log.warn(sv_cmd + ': ' + csum.data);
                        }
                    }
                    //conn.send();
                }   
            } catch (error) {
                gthis.log.error('on data: ' + error.message);
            }
        });
		
        conn.on('error', function(err) {
            gthis.log.error('error: ' + err.message);
            gthis.setStateChanged('info.connection', { val: false, ack: true });
        });		

        conn.on('close', function() {
            gthis.log.debug('connection closed');
        });		
    }

    /**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
            gthis.setStateChanged('info.connection', { val: false, ack: true });
            clearInterval(jobSchedule);
            clearTimeout(to1);
            clearTimeout(to2);
            clearTimeout(to3);
            clearTimeout(to4);
            clearTimeout(to5);
            clearTimeout(to6);
            clearTimeout(to7);
            clearTimeout(to8);
            clearTimeout(to9);
            clearTimeout(to10);
            clearTimeout(to11);
            conn.destroy();
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
    /*onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.debug(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.debug(`object ${id} deleted`);
        }
    }*/

    /**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
    /*onStateChange(id, state) {
        if (state) {
            // The state was changed
            //this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            //this.log.info(`state ${id} deleted`);
        }
    }*/

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
if (require.main !== module) {
    // Export the constructor in compact mode
    /**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
    module.exports = (options) => new Solarviewdatareader(options);
} else {
    // otherwise start the instance directly
    new Solarviewdatareader();
}