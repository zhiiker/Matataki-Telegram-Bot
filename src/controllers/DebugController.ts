import { injectable } from "inversify";

import { Controller, Command } from "../decorators";
import { MessageHandlerContext } from "../definitions";
import { IController } from "./IController";

@injectable()
@Controller("debug")
export class DebugController implements IController<DebugController> {
    @Command("ping", { ignorePrefix: true })
    ping({ message, reply }: MessageHandlerContext) {
        console.info(message);
        reply(`pong`);
    }
}
