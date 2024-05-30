// This file extends the AdapterConfig type from "@types/iobroker"
// using the actual properties present in io-package.json
// in order to provide typings for adapter.config properties

//import { native } from "../io-package.json";

//type _AdapterConfig = typeof native;

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			ipaddress: string;
			port: number;
			intervalVal: number;
			interval_seconds: boolean;
			intervalstart: string;
			intervalend: string;
			d0converter: boolean;
			pvi1: boolean;
			pvi2: boolean;
			pvi3: boolean;
			pvi4: boolean;
			scm0: boolean;
			scm1: boolean;
			scm2: boolean;
			scm3: boolean;
			scm4: boolean;
			setCCU: boolean;
			CCUSystemV: string;
			// Do not enter anything here!
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};