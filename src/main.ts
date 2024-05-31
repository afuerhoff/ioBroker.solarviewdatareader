'use strict';
/*
 * Created with @iobroker/create-adapter v1.14.0
 */

// The adapter-core module gives you access to the core ioBroker functions
import * as utils from '@iobroker/adapter-core';

// Load your modules here, e.g.:
import * as net from 'net';

const sv_cmd : string = '00*';
let conn: net.Socket;
let jobSchedule: NodeJS.Timeout;

//Timeout
let tout: NodeJS.Timeout;
//let to1, to2, to3, to4, to5, to6, to7, to8, to9, to10, to11;

interface ChecksumResult {
    result: boolean;
    chksum: number;
    ind: number;
    data: Buffer;
}

class Solarviewdatareader extends utils.Adapter {

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'solarviewdatareader',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    // Nullen voranstellen - add Leading Zero
    aLZ(n: number): string {
        return n <= 9 ? '0' + n : n.toString();
    }

    calcChecksum(inputString:string): ChecksumResult {
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
    
        const result: ChecksumResult = {
            'result': buffer[index] === sum,
            'chksum': sum,
            'ind': index,
            'data': buffer
        };
    
        return result;
    }

    //async createObject(that: Solarviewdatareader, id: string, typeVal: ioBroker.CommonType, name: string, commonType: string, role: string, def: any, rd: boolean, wr: boolean, desc: string, unit: string) {
    async createObject(id: string, obj: ioBroker.SettableObject) {
        await this.setObjectNotExistsAsync(id, obj);
    
        const currentState = await this.getStateAsync(id);
        const stCommon: ioBroker.StateCommon = obj.common as ioBroker.StateCommon; // Type Assertion
        if (currentState === null && stCommon.def !== undefined) {
            this.setState(id, stCommon.def, true); // set default
        }
    }

    async createGlobalObjects() {
        const options: [string, ioBroker.SettableObject][] =[
            ['info.connection', {type: 'state', common: {name: 'connection', type: 'boolean', role: 'indicator.connected', def: false, read: true, write: false, desc: 'Solarview connection state', unit: ''}, native: {}}],
            ['info.lastUpdate', {type: 'state', common: {name: 'lastUpdate', type: 'string', role: 'date', def: (new Date('1900-01-01T00:00:00')).toString(), read: true, write: false, desc: 'Last connection date/time', unit: ''}, native: {}}],
            //['info.connection', 'state', 'connection', 'boolean', 'indicator.connected', false, true, false, 'Solarview connection state', ''],
            //['info.lastUpdate', 'state', 'lastUpdate', 'string', 'date', (new Date('1900-01-01T00:00:00')).toString(), true, false, 'Last connection date/time', ''],
        ];
        /*const options: [string, string, string, string, string, any, boolean, boolean, string, string][] = [
            ['info.connection', 'state', 'connection', 'boolean', 'indicator.connected', false, true, false, 'Solarview connection state', ''],
            ['info.lastUpdate', 'state', 'lastUpdate', 'string', 'date', (new Date('1900-01-01T00:00:00')).toString(), true, false, 'Last connection date/time', ''],
        ];*/
    
        for (const option of options) {
            await this.createObject(...option);
        }
    }

    async createSolarviewObjects(device: string, additional: boolean = false) {
        let options: [string, ioBroker.SettableObject][] =[
            [device + '.current', {type: 'state', common: {name: 'current', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Current PAC', unit: 'W'}, native: {}}],
            [device + '.daily', {type: 'state', common: {name: 'daily', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Daily yield', unit: 'kWh'}, native: {}}],
            [device + '.monthly', {type: 'state', common: {name: 'monthly', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Monthly yield', unit: 'kWh'}, native: {}}],
            [device + '.yearly', {type: 'state', common: {name: 'yearly', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Yearly yield', unit: 'kWh'}, native: {}}],
            [device + '.total', {type: 'state', common: {name: 'total', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Total yield', unit: 'kWh'}, native: {}}],
        ];
        /*let options: [string, string, string, string, string, any, boolean, boolean, string, string][] = [
            [device + '.current', 'state', 'current', 'number', 'value', 0, true, false, 'Current PAC', 'W'],
            [device + '.daily', 'state', 'daily', 'number', 'value', 0, true, false, 'Daily yield', 'kWh'],
            [device + '.monthly', 'state', 'monthly', 'number', 'value', 0, true, false, 'Monthly yield', 'kWh'],
            [device + '.yearly', 'state', 'yearly', 'number', 'value', 0, true, false, 'Yearly yield', 'kWh'],
            [device + '.total', 'state', 'total', 'number', 'value', 0, true, false, 'Total yield', 'kWh'],
        ];*/
    
        if (additional) {
            const additionalOptions: [string, ioBroker.SettableObject][] =[
                [device + '.udc', {type: 'state', common: {name: 'udc', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Generator voltage', unit: 'V'}, native: {}}],
                [device + '.idc', {type: 'state', common: {name: 'idc', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Generator current', unit: 'A'}, native: {}}],
                [device + '.udcb', {type: 'state', common: {name: 'udcb', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Generator voltage', unit: 'V'}, native: {}}],
                [device + '.idcb', {type: 'state', common: {name: 'idcb', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Generator current', unit: 'A'}, native: {}}],
                [device + '.udcc', {type: 'state', common: {name: 'udcc', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Generator voltage', unit: 'V'}, native: {}}],
                [device + '.idcc', {type: 'state', common: {name: 'idcc', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Generator current', unit: 'A'}, native: {}}],
                [device + '.udcd', {type: 'state', common: {name: 'udcd', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Generator voltage', unit: 'V'}, native: {}}],
                [device + '.idcd', {type: 'state', common: {name: 'idcd', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Generator current', unit: 'A'}, native: {}}],
                [device + '.ul1', {type: 'state', common: {name: 'ul1', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Mains voltage', unit: 'V'}, native: {}}],
                [device + '.il1', {type: 'state', common: {name: 'il1', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Mains current', unit: 'A'}, native: {}}],
                [device + '.ul2', {type: 'state', common: {name: 'ul2', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Mains voltage', unit: 'V'}, native: {}}],
                [device + '.il2', {type: 'state', common: {name: 'il2', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Mains current', unit: 'A'}, native: {}}],
                [device + '.ul3', {type: 'state', common: {name: 'ul3', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Mains voltage', unit: 'V'}, native: {}}],
                [device + '.il3', {type: 'state', common: {name: 'il3', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Mains current', unit: 'A'}, native: {}}],
                [device + '.tkk', {type: 'state', common: {name: 'tkk', type: 'number', role: 'value', def: 0, read: true, write: false, desc: 'Temperature', unit: '°C'}, native: {}}],
            ];
            /*const additionalOptions: [string, string, string, string, string, any, boolean, boolean, string, string][] = [
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
            ];*/
            options = options.concat(additionalOptions);
        }
    
        for (const option of options) {
            await this.createObject(...option);
        }
    }

    async adjustIntervalToSeconds() {
        const adapterObj: ioBroker.Object | null | undefined = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
        if (!this.config.interval_seconds) {
            if (adapterObj) {
                adapterObj.native.interval_seconds = true;
                adapterObj.native.intervalVal *= 60;
                this.log.warn('Interval changed to seconds!');
                this.log.info('Interval attribute changed! Please check the configuration');
                this.log.info('Adapter restarts');
            }
        }
    }

    async getData(port: number, ip_address: string): Promise<void> {
        const { intervalstart, intervalend, d0converter, scm0, scm1, scm2, scm3, scm4, pvi1, pvi2, pvi3, pvi4 } = this.config;
    
        const starttime = intervalstart.split(':').slice(0, 2).join(':');
        let endtime = intervalend.split(':').slice(0, 2).join(':');
        endtime = endtime === '00:00' ? '23:59' : endtime;
    
        const dnow = new Date();
        const dstart = new Date(`${dnow.getFullYear()}-${dnow.getMonth() + 1}-${dnow.getDate()} ${starttime}`);
        const dend = new Date(`${dnow.getFullYear()}-${dnow.getMonth() + 1}-${dnow.getDate()} ${endtime}`);
    
        let timeoutCnt = 0;
    
        const executeCommand = (cmd: string) => {
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

    async onReady() {
        const ip_address: string = this.config.ipaddress;
        const port: number = this.config.port;
        let chkCnt = 0;
        const that = this;

        conn = new net.Socket();
        conn.setTimeout(2000);

        await this.createGlobalObjects();

        if (this.config.d0converter) await this.createSolarviewObjects('d0', false);
        if (this.config.scm0) await this.createSolarviewObjects('scm0', false);
        if (this.config.scm1) await this.createSolarviewObjects('scm1', false);
        if (this.config.scm2) await this.createSolarviewObjects('scm2', false);
        if (this.config.scm3) await this.createSolarviewObjects('scm3', false);
        if (this.config.scm4) await this.createSolarviewObjects('scm4', false);
        if (this.config.pvi1) await this.createSolarviewObjects('pvi1', true);
        if (this.config.pvi2) await this.createSolarviewObjects('pvi2', true);
        if (this.config.pvi3) await this.createSolarviewObjects('pvi3', true);
        if (this.config.pvi4) await this.createSolarviewObjects('pvi4', true);

        const processData = async (data: Buffer) => {
            let strdata = data.toString();
            let id: string;
            let pv: string;
            let cs: ChecksumResult;
            let sdata: string[];

            switch (true) {
                case strdata.startsWith('/'):
                    id = strdata.substring(1, 4);
                    pv = strdata.substring(5, strdata.length - 4);
                    cs = this.calcChecksum(strdata);
                    if (cs.result) {
                        that.setState(id, pv, true);
                    }
                    break;

                case strdata.startsWith(':'):
                    sdata = strdata.substring(1, strdata.length - 2).split(',');
                    that.setState('total', Number(sdata[3]) * 1000, true);
                    break;

                default:
                    that.log.warn(`Data cannot be processed: ${strdata}`);
                    break;
            }
        };

        conn.on('data', async (data) => {
            chkCnt = 0;
            clearTimeout(jobSchedule);
            jobSchedule = setTimeout(() => {
                this.getData(port, ip_address);
            }, this.config.intervalVal * 1000);
            await processData(data);
        });

        conn.on('close', () => {
            if (chkCnt > 3) {
                this.setState('info.connection', false, true);
                this.log.warn('Solarview Server is not reachable');
                chkCnt = 0;
            }
            chkCnt++;
            clearTimeout(jobSchedule);
            jobSchedule = setTimeout(() => {
                this.getData(port, ip_address);
            }, 10000);
        });

        conn.on('error', (err) => {
            this.log.error(err.message);
        });

        if (this.config.interval_seconds) {
            this.config.intervalVal = this.config.intervalVal / 60;
        } else {
            await this.adjustIntervalToSeconds.call(this);
        }

        jobSchedule = setTimeout(() => {
            this.getData(port, ip_address);
        }, 1000);
    }

    async onUnload(callback: () => void) {
        try {
            clearTimeout(jobSchedule);
            clearTimeout(tout);
            conn.destroy();
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Solarviewdatareader(options);
} else {
    (() => new Solarviewdatareader())();
}
