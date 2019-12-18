import { IController, BaseController } from "./BaseController";
export { IController, BaseController };

export interface ControllerConstructor {
    new(...args: any[]): IController;
}

import { DebugController } from "./DebugController";

import { WalletController } from "./WalletController";
import { GroupController } from "./GroupController";

export const controllers: ControllerConstructor[] = [
    DebugController,

    WalletController,
    GroupController,
];
