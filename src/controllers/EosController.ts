import { injectable } from "inversify";

import { Controller, Command } from "../decorators";
import { MessageHandlerContext } from "../definitions";
import { IController } from ".";

@injectable()
@Controller()
export class EosController implements IController<EosController> {
    @Command("bind")
    async bindUser({ message, reply }: MessageHandlerContext) {
    }

    @Command("query")
    async queryToken({ message, reply }: MessageHandlerContext) {

    }
}
