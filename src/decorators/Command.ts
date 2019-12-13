import { MetadataKeys } from "../constants";
import { CommandDefinition } from "../definitions";

type CommandBindingOptions = {
    ignorePrefix?: boolean;
}

export function Command(name: string, options?: CommandBindingOptions): MethodDecorator {
    return (target: Object, methodName: string | Symbol) => {
        if (methodName instanceof Symbol) {
            throw new Error("Impossible situation");
        }

        if (!Reflect.hasMetadata(MetadataKeys.CommandNames, target.constructor)) {
            Reflect.defineMetadata(MetadataKeys.CommandNames, [], target.constructor);
        }

        const commands = Reflect.getMetadata(MetadataKeys.CommandNames, target.constructor) as CommandDefinition[];
        commands.push({
            name,
            methodName,
            ignorePrefix: options?.ignorePrefix || false,
        });

        Reflect.defineMetadata(MetadataKeys.CommandNames, commands, target.constructor);
    };
}