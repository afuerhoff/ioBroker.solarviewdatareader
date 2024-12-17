'use strict';
/*
 * Created with @iobroker/create-adapter v1.14.0
 */

// The adapter-core module gives you access to the core ioBroker functions
import * as utils from '@iobroker/adapter-core';

// Load your modules here, e.g.:
import * as net from 'net';

interface ChecksumResult {
    result: boolean;
    chksum: number;
    ind: number;
    data: Buffer;
}

class Solarviewdatareader extends utils.Adapter {
    tout!: NodeJS.Timeout;
    jobSchedule!: NodeJS.Timeout;
    chkCnt = 0;
    conn!: net.Socket;
    lastCommand: string | null = null;
    private commandQueue: string[] = [];
    private isProcessingQueue = false;
    private isProcessingCmd = false;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'solarviewdatareader',
        });
        //this.pTimeoutcnt = 0;
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    // Nullen voranstellen - add Leading Zero
    aLZ(n: number): string {
        return n <= 9 ? `0${n}` : n.toString();
    }

    calcChecksum(inputString: string): ChecksumResult {
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
            result: buffer[index] === sum,
            chksum: sum,
            ind: index,
            data: buffer,
        };

        return result;
    }

    async createObject(id: string, obj: ioBroker.SettableObject): Promise<void> {
        await this.setObjectNotExistsAsync(id, obj);
        await this.extendObject(id, obj);

        const currentState = await this.getStateAsync(id);
        const stCommon: ioBroker.StateCommon = obj.common as ioBroker.StateCommon; // Type Assertion
        if (currentState === null && stCommon.def !== undefined) {
            await this.setState(id, stCommon.def, true); // set default
        }
    }

    async createGlobalObjects(): Promise<void> {
        const options: [string, ioBroker.SettableObject][] = [
            [
                'info.connection',
                {
                    type: 'state',
                    common: {
                        name: 'connection',
                        type: 'boolean',
                        role: 'indicator.connected',
                        def: false,
                        read: true,
                        write: false,
                        desc: 'Solarview connection state',
                        unit: '',
                    },
                    native: {},
                },
            ],
            [
                'info.lastUpdate',
                {
                    type: 'state',
                    common: {
                        name: 'lastUpdate',
                        type: 'string',
                        role: 'date',
                        def: new Date('1900-01-01T00:00:00').toString(),
                        read: true,
                        write: false,
                        desc: 'Last connection date/time',
                        unit: '',
                    },
                    native: {},
                },
            ],
        ];

        for (const option of options) {
            await this.createObject(...option);
        }
    }

    async createSolarviewObjects(device: string, additional: boolean = false): Promise<void> {
        let options: [string, ioBroker.SettableObject][] = [
            [device, { type: 'channel', common: { name: device }, native: {} }],
            [
                `${device}.current`,
                {
                    type: 'state',
                    common: {
                        name: 'current',
                        type: 'number',
                        role: 'value.power',
                        def: 0,
                        read: true,
                        write: false,
                        desc: 'Current PAC',
                        unit: 'W',
                    },
                    native: {},
                },
            ],
            [
                `${device}.daily`,
                {
                    type: 'state',
                    common: {
                        name: 'daily',
                        type: 'number',
                        role: 'value.energy',
                        def: 0,
                        read: true,
                        write: false,
                        desc: 'Daily yield',
                        unit: 'kWh',
                    },
                    native: {},
                },
            ],
            [
                `${device}.monthly`,
                {
                    type: 'state',
                    common: {
                        name: 'monthly',
                        type: 'number',
                        role: 'value.energy',
                        def: 0,
                        read: true,
                        write: false,
                        desc: 'Monthly yield',
                        unit: 'kWh',
                    },
                    native: {},
                },
            ],
            [
                `${device}.yearly`,
                {
                    type: 'state',
                    common: {
                        name: 'yearly',
                        type: 'number',
                        role: 'value.energy',
                        def: 0,
                        read: true,
                        write: false,
                        desc: 'Yearly yield',
                        unit: 'kWh',
                    },
                    native: {},
                },
            ],
            [
                `${device}.total`,
                {
                    type: 'state',
                    common: {
                        name: 'total',
                        type: 'number',
                        role: 'value.energy',
                        def: 0,
                        read: true,
                        write: false,
                        desc: 'Total yield',
                        unit: 'kWh',
                    },
                    native: {},
                },
            ],
        ];

        if (additional) {
            const additionalOptions: [string, ioBroker.SettableObject][] = [
                [
                    `${device}.udc`,
                    {
                        type: 'state',
                        common: {
                            name: 'udc',
                            type: 'number',
                            role: 'value.voltage',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Generator voltage',
                            unit: 'V',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.idc`,
                    {
                        type: 'state',
                        common: {
                            name: 'idc',
                            type: 'number',
                            role: 'value.current',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Generator current',
                            unit: 'A',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.udcb`,
                    {
                        type: 'state',
                        common: {
                            name: 'udcb',
                            type: 'number',
                            role: 'value.voltage',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Generator voltage',
                            unit: 'V',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.idcb`,
                    {
                        type: 'state',
                        common: {
                            name: 'idcb',
                            type: 'number',
                            role: 'value.current',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Generator current',
                            unit: 'A',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.udcc`,
                    {
                        type: 'state',
                        common: {
                            name: 'udcc',
                            type: 'number',
                            role: 'value.voltage',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Generator voltage',
                            unit: 'V',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.idcc`,
                    {
                        type: 'state',
                        common: {
                            name: 'idcc',
                            type: 'number',
                            role: 'value.current',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Generator current',
                            unit: 'A',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.udcd`,
                    {
                        type: 'state',
                        common: {
                            name: 'udcd',
                            type: 'number',
                            role: 'value.voltage',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Generator voltage',
                            unit: 'V',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.idcd`,
                    {
                        type: 'state',
                        common: {
                            name: 'idcd',
                            type: 'number',
                            role: 'value.current',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Generator current',
                            unit: 'A',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.ul1`,
                    {
                        type: 'state',
                        common: {
                            name: 'ul1',
                            type: 'number',
                            role: 'value.voltage',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Mains voltage',
                            unit: 'V',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.il1`,
                    {
                        type: 'state',
                        common: {
                            name: 'il1',
                            type: 'number',
                            role: 'value.current',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Mains current',
                            unit: 'A',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.ul2`,
                    {
                        type: 'state',
                        common: {
                            name: 'ul2',
                            type: 'number',
                            role: 'value.voltage',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Mains voltage',
                            unit: 'V',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.il2`,
                    {
                        type: 'state',
                        common: {
                            name: 'il2',
                            type: 'number',
                            role: 'value.current',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Mains current',
                            unit: 'A',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.ul3`,
                    {
                        type: 'state',
                        common: {
                            name: 'ul3',
                            type: 'number',
                            role: 'value.voltage',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Mains voltage',
                            unit: 'V',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.il3`,
                    {
                        type: 'state',
                        common: {
                            name: 'il3',
                            type: 'number',
                            role: 'value.current',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Mains current',
                            unit: 'A',
                        },
                        native: {},
                    },
                ],
                [
                    `${device}.tkk`,
                    {
                        type: 'state',
                        common: {
                            name: 'tkk',
                            type: 'number',
                            role: 'value.temperature',
                            def: 0,
                            read: true,
                            write: false,
                            desc: 'Temperature',
                            unit: '°C',
                        },
                        native: {},
                    },
                ],
            ];
            options = options.concat(additionalOptions);
        }

        for (const option of options) {
            await this.createObject(...option);
        }
    }

    async adjustIntervalToSeconds(): Promise<void> {
        const adapterObj: ioBroker.Object | null | undefined = await this.getForeignObjectAsync(
            `system.adapter.${this.namespace}`,
        );
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

    preprocessSolarviewData(response: Buffer): string[] {
        let sv_data = response.toString('ascii');
        sv_data = sv_data.replace(/[{}]+/g, ''); // Remove "{}"
        return sv_data.split(',');
    }

    getSolarviewPrefix(dataCode: string): string {
        const prefixMap: { [key: string]: string } = {
            '00': 'pvig.',
            '01': 'pvi1.',
            '02': 'pvi2.',
            '03': 'pvi3.',
            '04': 'pvi4.',
            10: 'scm0.',
            11: 'scm1.',
            12: 'scm2.',
            13: 'scm3.',
            14: 'scm4.',
            21: 'd0supply.',
            22: 'd0consumption.',
        };
        return prefixMap[dataCode] || '';
    }

    async updateSolarviewStates(sv_data: string[], sv_prefix: string): Promise<void> {
        try {
            this.updateState(`${sv_prefix}current`, sv_data, 10);
            if (sv_prefix === 'pvig.') {
                await this.handleCCUUpdate(sv_data);
            }
            this.updateState(`${sv_prefix}daily`, sv_data, 6);
            this.updateState(`${sv_prefix}monthly`, sv_data, 7);
            this.updateState(`${sv_prefix}yearly`, sv_data, 8);
            this.updateState(`${sv_prefix}total`, sv_data, 9);

            if (sv_data.length >= 23) {
                this.updateExtendedStates(sv_data, sv_prefix);
            }
        } catch (error: any) {
            this.log.error(`updateSolarviewStates: ${error}`);
        }
    }

    async handleCCUUpdate(sv_data: string[]): Promise<void> {
        if (this.config.setCCU) {
            const obj = await this.findForeignObjectAsync(this.config.CCUSystemV, 'state');
            if (obj && obj.name) {
                this.log.debug(`set CCU system variable: ${this.config.CCUSystemV}`);
                this.setForeignState(this.config.CCUSystemV, { val: Number(sv_data[10]), ack: false });
            } else {
                this.log.error(`CCU system variable ${this.config.CCUSystemV} does not exist!`);
            }
        }
    }

    private updateExtendedStates(sv_data: string[], sv_prefix: string): void {
        this.updateState(`${sv_prefix}udc`, sv_data, 11);
        this.updateState(`${sv_prefix}idc`, sv_data, 12);
        this.updateState(`${sv_prefix}udcb`, sv_data, 13);
        this.updateState(`${sv_prefix}idcb`, sv_data, 14);
        this.updateState(`${sv_prefix}udcc`, sv_data, 15);
        this.updateState(`${sv_prefix}idcc`, sv_data, 16);
        this.updateState(`${sv_prefix}udcd`, sv_data, 17);
        this.updateState(`${sv_prefix}idcd`, sv_data, 18);

        if (sv_data.length === 27) {
            // Neue Version Solarview
            this.updateState(`${sv_prefix}ul1`, sv_data, 19);
            this.updateState(`${sv_prefix}il1`, sv_data, 20);
            this.updateState(`${sv_prefix}ul2`, sv_data, 21);
            this.updateState(`${sv_prefix}il2`, sv_data, 22);
            this.updateState(`${sv_prefix}ul3`, sv_data, 23);
            this.updateState(`${sv_prefix}il3`, sv_data, 24);
            this.updateState(`${sv_prefix}tkk`, sv_data, 25);
        } else if (sv_data.length === 23) {
            // Alte Version Solarview
            this.updateState(`${sv_prefix}ul1`, sv_data, 19);
            this.updateState(`${sv_prefix}il1`, sv_data, 20);
            this.updateState(`${sv_prefix}tkk`, sv_data, 21);
        }
    }

    private updateState(stateName: string, sv_data: string[], index: number): void {
        const value = Number(sv_data[index]);
        this.setStateChanged(stateName, { val: value, ack: true });
    }

    private async onReady(): Promise<void> {
        try {
            const starttime = this.config.intervalstart.split(':').slice(0, 2).join(':');
            const endtime = this.config.intervalend.split(':').slice(0, 2).join(':');

            this.log.info(
                `start solarview ${this.config.ipaddress}:${this.config.port} - polling interval: ${this.config.intervalVal}s (${starttime} to ${
                    endtime
                })`,
            );
            this.log.info(`d0 converter: ${this.config.d0converter.toString()}`);

            await this.createGlobalObjects();

            await this.createSolarviewObjects('pvig', false);
            if (this.config.d0converter) {
                await this.createSolarviewObjects('d0supply', false);
            }
            if (this.config.d0converter) {
                await this.createSolarviewObjects('d0consumption', false);
            }
            if (this.config.scm0) {
                await this.createSolarviewObjects('scm0', false);
            }
            if (this.config.scm1) {
                await this.createSolarviewObjects('scm1', false);
            }
            if (this.config.scm2) {
                await this.createSolarviewObjects('scm2', false);
            }
            if (this.config.scm3) {
                await this.createSolarviewObjects('scm3', false);
            }
            if (this.config.scm4) {
                await this.createSolarviewObjects('scm4', false);
            }
            if (this.config.pvi1) {
                await this.createSolarviewObjects('pvi1', true);
            }
            if (this.config.pvi2) {
                await this.createSolarviewObjects('pvi2', true);
            }
            if (this.config.pvi3) {
                await this.createSolarviewObjects('pvi3', true);
            }
            if (this.config.pvi4) {
                await this.createSolarviewObjects('pvi4', true);
            }

            if (!this.config.interval_seconds) {
                await this.adjustIntervalToSeconds.call(this);
            }

            this.conn = new net.Socket();
            this.conn.setTimeout(2000);
            this.conn.on('data', this.onDataHandler.bind(this));
            this.conn.on('close', this.onCloseHandler.bind(this));
            this.conn.on('error', this.onErrorHandler.bind(this));

            //First start
            await this.setCmdQueue();

            this.jobSchedule = setInterval(async () => {
                try {
                    await this.setCmdQueue();
                } catch (error: any) {
                    this.log.error(`onReady.schedule: ${error.message}`);
                }
            }, this.config.intervalVal * 1000);
        } catch (error: any) {
            this.log.error(`onReady: ${error.message}`);
        }
    }

    async onDataHandler(data: any): Promise<void> {
        try {
            await this.processData(data);
            this.conn.end();
        } catch (error: any) {
            this.log.error(`conn.on data: ${error.message}`);
        }
    }

    processData = async (data: Buffer): Promise<void> => {
        try {
            const strdata: string[] = this.preprocessSolarviewData(data);
            const id = this.getSolarviewPrefix(strdata[0]);
            const cs: ChecksumResult = this.calcChecksum(data.toString('ascii'));
            if (cs.result) {
                await this.handleChecksumSuccess(strdata, id, data);
            } else {
                this.handleChecksumFailure(strdata, cs);
            }
        } catch (error: any) {
            this.log.error(`processData: ${error.message}`);
        }
    };

    async handleChecksumSuccess(sv_data: string[], sv_prefix: string, response: Buffer): Promise<void> {
        try {
            this.chkCnt = 0;
            this.log.debug(`${response.toString('ascii')}`);

            await this.updateSolarviewStates(sv_data, sv_prefix);

            const sDate = `${sv_data[3]}-${this.aLZ(parseInt(sv_data[2]))}-${this.aLZ(parseInt(sv_data[1]))} ${this.aLZ(parseInt(sv_data[4]))}:${this.aLZ(parseInt(sv_data[5]))}`;
            this.setStateChanged('info.lastUpdate', { val: sDate, ack: true });
            this.setStateChanged('info.connection', { val: true, ack: true });
        } catch (error: any) {
            this.log.error(`handleChecksumSuccess: ${error}`);
        }
    }

    handleChecksumFailure(sv_data: string[], csum: ChecksumResult): void {
        if (csum.chksum !== 0) {
            if (csum.data.toString('ascii') != ';-)\n') {
                this.chkCnt += 1;
                this.log.warn(`checksum not correct! ${sv_data[0]}: ${csum.data.toString('ascii')}`);
            } else {
                //else -> option not supported from Solarview due to missing Inverter -> chksum ;-)\n
                this.log.warn(`command ${this.lastCommand} not supported!`);
            }
        }
    }

    private async onCloseHandler(): Promise<void> {
        try {
            if (this.lastCommand) {
                this.log.debug(`Connection closed after executing command: ${this.lastCommand}`);
            } else {
                this.log.debug('Connection closed');
            }
            this.isProcessingCmd = false;
            if (this.chkCnt > 3) {
                await this.setState('info.connection', false, true);
                this.log.warn('Solarview Server is not reachable');
                this.chkCnt = 0;
            }
        } catch (error: any) {
            this.log.error(`conn.on close: ${error.message}`);
        }
    }

    onErrorHandler(err: any): void {
        this.log.error(`conn.on error - cmd: ${this.lastCommand} - ${err.message}`);
    }

    _sleep(milliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    connectAsync = (port: number, ip_address: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            this.conn.connect(port, ip_address, () => {
                resolve();
            });
            this.conn.on('error', err => {
                reject(err);
            });
        });
    };

    async setCmdQueue(): Promise<void> {
        const commands: string[] = [];
        const { d0converter, scm0, scm1, scm2, scm3, scm4, pvi1, pvi2, pvi3, pvi4, intervalstart, intervalend } =
            this.config;

        const starttime = intervalstart.split(':').slice(0, 2).join(':');
        let endtime = intervalend.split(':').slice(0, 2).join(':');
        endtime = endtime === '00:00' ? '23:59' : endtime;

        const dnow = new Date();
        const dstart = new Date(`${dnow.getFullYear()}-${dnow.getMonth() + 1}-${dnow.getDate()} ${starttime}`);
        const dend = new Date(`${dnow.getFullYear()}-${dnow.getMonth() + 1}-${dnow.getDate()} ${endtime}`);

        if (dnow >= dstart && dnow <= dend) {
            commands.push('00*'); // pvig
            if (d0converter) {
                commands.push('21*');
            }
            if (pvi1) {
                commands.push('01*');
            }
            if (pvi2) {
                commands.push('02*');
            }
            if (pvi3) {
                commands.push('03*');
            }
            if (pvi4) {
                commands.push('04*');
            }
        }

        if (d0converter) {
            commands.push('22*');
        }
        if (scm0) {
            commands.push('10*');
        }
        if (scm1) {
            commands.push('11*');
        }
        if (scm2) {
            commands.push('12*');
        }
        if (scm3) {
            commands.push('13*');
        }
        if (scm4) {
            commands.push('14*');
        }

        // Befehle zur Warteschlange hinzufügen
        this.commandQueue.push(...commands);

        // Verarbeite die Warteschlange
        await this.processQueue();
    }

    async processQueue(): Promise<void> {
        if (this.isProcessingQueue) {
            this.log.error(`processQueue: queue not empty! Waiting ...`);
            return;
        }
        this.isProcessingQueue = true;

        while (this.commandQueue.length > 0) {
            if (!this.isProcessingCmd) {
                const cmd = this.commandQueue.shift();
                if (cmd) {
                    try {
                        this.isProcessingCmd = true;
                        await this.executeCommand(cmd);
                    } catch (error: any) {
                        this.log.error(`processQueue.executeCommand: ${error}`);
                    }
                }
            }
            await this._sleep(500);
        }
        this.isProcessingQueue = false;
    }

    private async executeCommand(cmd: string): Promise<void> {
        this.log.debug(`Attempting to execute command: ${cmd}`);
        try {
            await this.connectAsync(this.config.port, this.config.ipaddress);
            this.lastCommand = cmd;
            this.conn.write(cmd);
            this.log.debug(`Command successfully sent: ${cmd}`);
        } catch (error: any) {
            this.log.error(`Error executing command ${cmd}: ${error.message}`);
            throw error;
        }
    }

    private onUnload(callback: () => void): void {
        try {
            clearInterval(this.jobSchedule);
            clearTimeout(this.tout);
            this.conn.destroy();
            this.setStateChanged('info.connection', { val: false, ack: true });
            this.log.info('cleaned everything up...');
            callback();
        } catch (error: any) {
            this.log.info(`onUnload: ${error.message}`);
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Solarviewdatareader(options);
} else {
    (() => new Solarviewdatareader())();
}
