import { decorate, injectable } from "inversify";

import { BaseController } from "../controllers";
import { MetadataKeys } from "../constants";

export function Controller(prefix: string): ClassDecorator {
    return (target: Function) => {
        if (!BaseController.isPrototypeOf(target)) {
            throw new Error("Target type must be a derived class of BaseController");
        }
        if (Reflect.hasMetadata(MetadataKeys.ControllerPrefix, target)) {
            throw new Error("Cannot apply @Controller decorator multiple times");
        }

        decorate(injectable(), target);

        Reflect.defineMetadata(MetadataKeys.ControllerPrefix, prefix, target);
    };
}
