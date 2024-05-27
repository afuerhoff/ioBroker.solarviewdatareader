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
const sv_cmd = '00*';
let conn;
let jobSchedule;


//Timeout
let tout;
//let to1, to2, to3, to4, to5, to6, to7, to8, to9, to10, to11;

// Nullen voranstellen - add Leading Zero
function aLZ(n) {
    return n <= 9 ? '0' + n : n.toString();
}

function calcChecksum(inputString) {
    const buffer = Buffer.from(inputString);
    let sum = 0;
    let index = 0;

    for (let i = 0; i < buffer.length; i++) {
        sum = (sum + buffer[i]) % 128;
        if (buffer[i] === 125) {
            index = i + 2;
            break;
        }
    }

    const result = {
        'result': buffer[index] === sum,
        'chksum': sum,
        'ind': index,
        'data': buffer
    };

    return result;
}

async function createObject(that, id, type, name, commonType, role, def, rd, wr, desc, unit) {
    await that.setObjectNotExists(id, {
        type,
        common: {
            name,
            type: commonType,
            role,
            def,
            read: rd,
            write: wr,
            desc,
            unit,
        },
        native: {},
    });

    const currentState = await that.getStateAsync(id);
    if (currentState === null) {
        that.setState(id, def, true); // set default
    }
}

async function createGlobalObjects(that) {
    const options = [
        ['info.connection', 'state', 'connection', 'boolean', 'indicator.connected', false, true, false, 'Solarview connection state',''],
        ['info.lastUpdate', 'state', 'lastUpdate', 'string', 'date', (new Date('1900-01-01T00:00:00')).toString(), true, false, 'Last connection date/time', ''],
    ];

    for (const option of options) {
        await createObject(that, ...option);
    }
}

async function createSolarviewObjects(that, device, additional) {
    let options = [
        [device + '.current', 'state', 'current', 'number', 'value', 0, true, false, 'Current PAC', 'W'],
        [device + '.daily', 'state', 'daily', 'number', 'value', 0, true, false, 'Daily yield', 'kWh'],
        [device + '.monthly', 'state', 'monthly', 'number', 'value', 0, true, false, 'Monthly yield', 'kWh'],
        [device + '.yearly', 'state', 'yearly', 'number', 'value', 0, true, false, 'Yearly yield', 'kWh'],
        [device + '.total', 'state', 'total', 'number', 'value', 0, true, false, 'Total yield', 'kWh'],
    ];
 
    if (additional) {
        const additionalOptions = [
            [device + '.udc', 'state', 'udc', 'number', 'value', 0, true, false, 'Generator voltage', 'V'],
            [device + '.idc', 'state', 'idc', 'number', 'value', 0, true, false, 'Generator current', 'A'],
            [device + '.udcb', 'state', 'udcb', 'number', 'value', 0, true, false, 'Generator voltage', 'V'],
            [device + '.idcb', 'state', 'idcb', 'number', 'value', 0, true, false, 'Generator current', 'A'],
            [device + '.udcc', 'state', 'udcc', 'number', 'value', 0, true, false, 'Generator voltage', 'V'],
            [device + '.idcc', 'state', 'idcc', 'number', 'value', 0, true, false, 'Generator current', 'A'],
            [device + '.udcd', 'state', 'udcd', 'number', 'value', 0, true, false, 'Generator voltage', 'V'],
            [device + '.idcd', 'state', 'idcd', 'number', 'value', 0, true, false, 'Generator current', 'A'],
            [device + '.ul1', 'state', 'ul1', 'number', 'value', 0, true, false, 'Mains voltage', 'V'],
            [device + '.il1', 'state', 'il1', 'number', 'value', 0, true, false, 'Mains current', 'A'],
            [device + '.ul2', 'state', 'ul2', 'number', 'value', 0, true, false, 'Mains voltage', 'V'],
            [device + '.il2', 'state', 'il2', 'number', 'value', 0, true, false, 'Mains current', 'A'],
            [device + '.ul3', 'state', 'ul3', 'number', 'value', 0, true, false, 'Mains voltage', 'V'],
            [device + '.il3', 'state', 'il3', 'number', 'value', 0, true, false, 'Mains current', 'A'],
            [device + '.tkk', 'state', 'tkk', 'number', 'value', 0, true, false, 'Temperature', '°C'],
        ];
        options = options.concat(additionalOptions);
    }

    for (const option of options) {
        await createObject(that, ...option);
    }
}

async function getData(port, ip_address) {
    const { intervalstart, intervalend, d0converter, scm0, scm1, scm2, scm3, scm4, pvi1, pvi2, pvi3, pvi4 } = gthis.config;

    const starttime = intervalstart.split(':').slice(0, 2).join(':');
    let endtime = intervalend.split(':').slice(0, 2).join(':');
    endtime = endtime === '00:00' ? '23:59' : endtime;

    const dnow = new Date();
    const dstart = new Date(`${dnow.getFullYear()}-${dnow.getMonth() + 1}-${dnow.getDate()} ${starttime}`);
    const dend = new Date(`${dnow.getFullYear()}-${dnow.getMonth() + 1}-${dnow.getDate()} ${endtime}`);

    let timeoutCnt = 0;

    const executeCommand = (cmd) => {
        timeoutCnt += 500;
        tout = setTimeout(() => {
            conn.connect(port, ip_address, () => {
                conn.write(cmd);
                conn.end();
            });
        }, timeoutCnt);
    };

    if (dnow >= dstart && dnow <= dend) {
        executeCommand('00*'); // pvig

        if (d0converter) executeCommand('21*');
        if (pvi1) executeCommand('01*');
        if (pvi2) executeCommand('02*');
        if (pvi3) executeCommand('03*');
        if (pvi4) executeCommand('04*');
    }

    if (d0converter) executeCommand('22*');
    if (scm0) executeCommand('10*');
    if (scm1) executeCommand('11*');
    if (scm2) executeCommand('12*');
    if (scm3) executeCommand('13*');
    if (scm4) executeCommand('14*');
}

async function adjustIntervalToSeconds() {
    const adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
    if (!this.config.interval_seconds) {
        this.log.warn('Interval changed to seconds!');
        adapterObj.native.interval_seconds = true;
        adapterObj.native.intervalVal *= 60;

        this.log.info('Interval attribute changed! Please check the configuration');
        this.log.info('Adapter restarts');

        await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, adapterObj);
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

        const starttime = this.config.intervalstart.split(':').slice(0, 2).join(':');
        const endtime = this.config.intervalend.split(':').slice(0, 2).join(':');
    
        this.log.info('start solarview ' + ip_address + ':' + port + ' - polling interval: ' + this.config.intervalVal + ' Min. (' + starttime + ' to ' + endtime + ')');
        //this.log.info('start solarview ' + ip_address + ':' + port + ' - polling interval: ' + this.config.intervalVal);
        this.log.info('d0 converter: ' + this.config.d0converter.toString());

        //Workaround for interval change to seconds for older installed versions
        await adjustIntervalToSeconds.call(this);

        // Datenobjekte erzeugen
        await createGlobalObjects(gthis);
        await createSolarviewObjects(gthis, 'pvig');

        if (gthis.config.d0converter) {
            // d0converter hinzufügen
            await createSolarviewObjects(gthis, 'd0supply', false);
            await createSolarviewObjects(gthis, 'd0consumption', false);
        }

        // Zusätzliche Datenobjekte für Wechselrichter
        for (let inv = 1; inv < 5; inv++) {
            const invConfigKey = `pvi${inv}`;
            if (gthis.config[invConfigKey]) {
                this.log.info(`photovoltaic inverter ${inv} enabled`);
                await createSolarviewObjects(gthis, invConfigKey, true);
            }
        }

        // Self consumption meter 0, 1-4
        for (let inv = 0; inv < 5; inv++) {
            const scmConfigKey = `scm${inv}`;
            if (gthis.config[scmConfigKey]) {
                this.log.info(`self consumption meter ${inv} enabled`);
                await createSolarviewObjects(gthis, scmConfigKey, false);
            }
        }

        // in this adapter all states changes inside the adapters namespace are not subscribed
        //this.subscribeStates('*');

        //Verbindung herstellen
        conn = new net.Socket();
		
        //Intervall ausführen
        const cron = this.config.intervalVal * 1000;
        try {
            getData(port, ip_address);
            jobSchedule = setInterval(async function(){
                getData(port, ip_address);
            }, cron);		  
        } catch (err) {
            this.log.error('schedule: ' + err.message);
        }			
		
        conn.on('data', async function (response) {
            try {
                if (response == null) {
                    handleConnectionError(gthis, 'connect: cannot read data from solarview tcp-server! Please have a look in to the solarview documentation!');
                } else {
                    gthis.setStateChanged('info.connection', { val: true, ack: true });
                    const sv_data = preprocessSolarviewData(response);
                    const csum = calcChecksum(response.toString('ascii'));
                    const sv_prefix = getSolarviewPrefix(sv_data[0]);
        
                    if (csum.result) {
                        handleChecksumSuccess(gthis, sv_data, sv_prefix, response);
                    } else {
                        handleChecksumFailure(gthis, csum, response);
                    }
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

        function preprocessSolarviewData(response) {
            let sv_data = response.toString('ascii');
            sv_data = sv_data.replace(/[{}]+/g, ''); // Remove "{}"
            return sv_data.split(',');
        }
        
        function getSolarviewPrefix(dataCode) {
            const prefixMap = {
                '00': 'pvig.',
                '01': 'pvi1.',
                '02': 'pvi2.',
                '03': 'pvi3.',
                '04': 'pvi4.',
                '10': 'scm0.',
                '11': 'scm1.',
                '12': 'scm2.',
                '13': 'scm3.',
                '14': 'scm4.',
                '21': 'd0supply.',
                '22': 'd0consumption.'
            };
            return prefixMap[dataCode] || '';
        }
        
        function handleConnectionError(gthis, errorMessage) {
            gthis.log.error(errorMessage);
            gthis.setStateChanged('info.connection', { val: false, ack: true });
        }
        
        function handleChecksumSuccess(gthis, sv_data, sv_prefix, response) {
            chkCnt = 0;
            gthis.log.debug(sv_cmd + ': ' + response.toString('ascii'));
        
            updateSolarviewStates(gthis, sv_data, sv_prefix);
        
            const sDate = `${sv_data[3]}-${aLZ(sv_data[2])}-${aLZ(sv_data[1])} ${aLZ(sv_data[4])}:${aLZ(sv_data[5])}`;
            gthis.setStateChanged('info.lastUpdate', { val: sDate, ack: true });
        }
        
        function handleChecksumFailure(gthis, csum, response) {
            chkCnt += 1;
            if (chkCnt > 0 && csum.chksum !== 0) {
                const buf = new Buffer(response.toString('ascii'));
                gthis.log.warn(`checksum not correct! <${buf[csum.ind - 1]} ${buf[csum.ind]} ${buf[csum.ind + 1]} ${buf[csum.ind + 2]}   ${csum.chksum}>`);
                gthis.log.warn(`${sv_cmd}: ${csum.data}`);
            }
        }
        
        function updateSolarviewStates(gthis, sv_data, sv_prefix) {
            updateState(gthis, sv_prefix + 'current', sv_data, 10);
            if (sv_prefix === 'pvig.') {
                handleCCUUpdate(gthis, sv_data);
            }
            updateState(gthis, sv_prefix + 'daily', sv_data, 6);
            updateState(gthis, sv_prefix + 'monthly', sv_data, 7);
            updateState(gthis, sv_prefix + 'yearly', sv_data, 8);
            updateState(gthis, sv_prefix + 'total', sv_data, 9);
        
            if (sv_data.length >= 23) {
                updateExtendedStates(gthis, sv_data, sv_prefix);
            }
        }
        
        function updateState(gthis, stateName, sv_data, index) {
            const value = Number(sv_data[index]);
            gthis.setStateChanged(stateName, { val: value, ack: true });
        }
        
        async function handleCCUUpdate(gthis, sv_data) {
            if (gthis.config.setCCU) {
                const obj = await gthis.findForeignObjectAsync(gthis.config.CCUSystemV);
                if (obj.id) {
                    gthis.log.debug('set CCU system variable: ' + gthis.config.CCUSystemV);
                    gthis.setForeignState(gthis.config.CCUSystemV, { val: Number(sv_data[10]), ack: false });
                } else {
                    gthis.log.error(`CCU system variable ${gthis.config.CCUSystemV} does not exist!`);
                }
            }
        }
        
        function updateExtendedStates(gthis, sv_data, sv_prefix) {
            updateState(gthis, sv_prefix + 'udc', sv_data, 11);
            updateState(gthis, sv_prefix + 'idc', sv_data, 12);
            updateState(gthis, sv_prefix + 'udcb', sv_data, 13);
            updateState(gthis, sv_prefix + 'idcb', sv_data, 14);
            updateState(gthis, sv_prefix + 'udcc', sv_data, 15);
            updateState(gthis, sv_prefix + 'idcc', sv_data, 16);
            updateState(gthis, sv_prefix + 'udcd', sv_data, 17);
            updateState(gthis, sv_prefix + 'idcd', sv_data, 18);
        
            if (sv_data.length == 27) { // Neue Version Solarview
                updateState(gthis, sv_prefix + 'ul1', sv_data, 19);
                updateState(gthis, sv_prefix + 'il1', sv_data, 20);
                updateState(gthis, sv_prefix + 'ul2', sv_data, 21);
                updateState(gthis, sv_prefix + 'il2', sv_data, 22);
                updateState(gthis, sv_prefix + 'ul3', sv_data, 23);
                updateState(gthis, sv_prefix + 'il3', sv_data, 24);
                updateState(gthis, sv_prefix + 'tkk', sv_data, 25);
            } else if (sv_data.length == 23) { // Alte Version Solarview
                updateState(gthis, sv_prefix + 'ul1', sv_data, 19);
                updateState(gthis, sv_prefix + 'il1', sv_data, 20);
                updateState(gthis, sv_prefix + 'tkk', sv_data, 21);
            }
        }
        
		
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
            clearTimeout(tout);
            /*clearTimeout(to2);
            clearTimeout(to3);
            clearTimeout(to4);
            clearTimeout(to5);
            clearTimeout(to6);
            clearTimeout(to7);
            clearTimeout(to8);
            clearTimeout(to9);
            clearTimeout(to10);
            clearTimeout(to11);*/
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