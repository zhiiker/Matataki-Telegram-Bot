import { inject, Container } from "inversify";
import Telegraf, { ContextMessageUpdate, session, Markup } from "telegraf";
import { User as TelegramUser } from "telegraf/typings/telegram-types";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { getRepository, Repository } from "typeorm";

import { Injections, LogCategories } from "#/constants";
import { controllers } from "#/controllers/export";
import { MessageHandlerContext } from "#/definitions";
import { Service } from "#/decorators";
import { Group, Metadata, Update, User } from "#/entities";
import { IBotService, IDatabaseService, ILoggerService, II18nService } from "#/services";
import { delay } from "#/utils";
import { GroupController } from "#/controllers/GroupController";
import { IUserRepository } from "#/repositories";
import { IMiddlewareService } from "../IMiddlewareService";

@Service(Injections.BotService)
export class BotServiceImpl implements IBotService {
    private bot: Telegraf<ContextMessageUpdate>;

    private botInfo?: TelegramUser;
    get info() {
        if (!this.botInfo) {
            throw new Error("The bot is not running");
        }

        return this.botInfo;
    }

    private _isRunning: boolean = false;
    public get isRunning() {
        return this._isRunning;
    }

    get api() {
        return this.bot.telegram;
    }

    private updateRepo?: Repository<Update>;

    constructor(@inject(Injections.DatabaseService) private databaseService: IDatabaseService,
        @inject(Injections.LoggerService) private logger: ILoggerService,
        @inject(Injections.I18nService) private i18nService: II18nService,
        @inject(Injections.MiddlewareService) private middlewareService: IMiddlewareService,
        @inject(Injections.Container) private container: Container) {
        console.assert(process.env.BOT_TOKEN);

        const agent = process.env.HTTPS_PROXY_HOST && process.env.HTTPS_PROXY_PORT ?
            new HttpsProxyAgent({
                host: process.env.HTTPS_PROXY_HOST,
                port: process.env.HTTPS_PROXY_PORT
            }) :
            process.env.SOCKS_PROXY ?
                new SocksProxyAgent(process.env.SOCKS_PROXY)
                : undefined;

        this.bot = new Telegraf<ContextMessageUpdate>(process.env.BOT_TOKEN!, {
            telegram: { agent: agent ? Object.assign(agent, { options: {} }) : undefined },
        });

        this.bot.use(session());

        this.middlewareService.attachBaseMiddlewares(this.bot);

        this.bot.use((ctx, next) => {
            console.log("Update", ctx.update);

            if (!this.updateRepo) {
                this.updateRepo = getRepository(Update);
            }

            const update = new Update();
            update.id = ctx.update.update_id;
            update.content = ctx.update;

            this.updateRepo.save(update);

            if (next) return next();
        });
        this.bot.use(async (ctx, next) => {
            const start = new Date().getTime();
            if (next) await next()
            const ms = new Date().getTime() - start;

            console.log('Response time: %sms', ms);
        });
        this.bot.use(this.i18nService.middleware());
        this.bot.catch((err: any, ctx: ContextMessageUpdate) => {
            const { reply } = ctx;

            this.logger.error(LogCategories.TelegramUpdate, err);

            if (err instanceof Error && err.message) {
                reply("Unhandled error: " + err.message);
            } else {
                reply("Unhandled error: " + err);
            }
        });
        this.bot.start(async ctx => {
            const { message, i18n } = ctx;
            const { startPayload } = ctx as any;

            const userRepo = container.getNamed<IUserRepository>(Injections.Repository, User.name);
            await userRepo.ensureUser(message!.from!);

            do {
                if (!startPayload) {
                    break;
                }

                const groupId = Number.parseInt(startPayload);
                if (Number.isNaN(groupId)) {
                    break;
                }

                const controller = container.getNamed<GroupController>(Injections.Controller, GroupController.name);

                if (await controller.joinGroupWithStartPayload(ctx as MessageHandlerContext, startPayload)) {
                    return;
                }
            } while (false);

            ctx.telegram.sendMessage(ctx.chat!.id, i18n.t("bot.start"), { parse_mode: 'Markdown', disable_web_page_preview: true });
        });
        this.bot.help(ctx => {
            const { i18n } = ctx;
            ctx.replyWithMarkdown(i18n.t("bot.help.header"), Markup.inlineKeyboard([
                [Markup.callbackButton(i18n.t("bot.help.introduction.title"), "help1")],
                [Markup.callbackButton(i18n.t("bot.help.fandomTicketIntroduction.title"), "help2")],
                [Markup.callbackButton(i18n.t("bot.help.command.title"), "help3")],
                [Markup.callbackButton(i18n.t("bot.help.howToJoinFandomGroup.title"), "help4")],
                [Markup.callbackButton(i18n.t("bot.help.howToCreateFandomGroup.title"), "help5")],
                [Markup.callbackButton(i18n.t("bot.help.howToRemoveFandomGroup.title"), "help6")],
                [Markup.callbackButton(i18n.t("bot.help.videoTutorial.title"), "help7")],
                [Markup.callbackButton(i18n.t("bot.help.redEnvelope.title"), "help8")],
                [Markup.callbackButton(i18n.t("bot.help.dice.title"), "help11")],
                [Markup.callbackButton(i18n.t("bot.help.transfer.title"), "help9")],
                [Markup.callbackButton(i18n.t("bot.help.otherQuestion.title"), "help10")],
            ]).extra());
        });

        this.middlewareService.attachControllers(this.bot, controllers);

        this.bot.on("message", ctx => {
            const { message, i18n } = ctx;
            if (!message) {
                throw new Error("What happended?");
            }

            if (message.chat.type !== "private") {
                return;
            }

            ctx.reply(i18n.t("bot.defaultReply"));
        });
    }

    async run() {
        await this.databaseService.ensureDatabase();

        await this.checkBotOwner();

        await delay(2000);

        const isWebhookMode = process.env.WEBHOOK_PORT && process.env.WEBHOOK_URL;

        if (isWebhookMode) {
            // Start In the Webhook mode, Use caddy or other HTTPS Server to proxy the webhook
            await this.bot.startWebhook('/', null, Number(process.env.WEBHOOK_PORT!))
            await this.bot.telegram.setWebhook(process.env.WEBHOOK_URL!);
        } else {
            // Not Detected, going to getUpdate polling
            await this.bot.startPolling();
        }

        this._isRunning = true;
        console.log(`Matataki bot is running in ${isWebhookMode ? "Webhook" : "getUpdate Polling"} Mode...`);
    }

    async checkBotOwner() {
        this.botInfo = await this.bot.telegram.getMe();

        const metadataRepo = getRepository(Metadata);

        let botInfo = await metadataRepo.findOne("bot_info");
        if (!botInfo) {
            botInfo = new Metadata();
            botInfo.name = "bot_info";
            botInfo.value = {
                id: this.botInfo.id,
            };

            await metadataRepo.save(botInfo);
            return;
        }

        if (botInfo.value.id === this.botInfo.id) {
            this.bot.options.username = this.botInfo.username;
            return;
        }

        console.error("您的机器人信息对不上当前的数据库 schema，请把 ormconfig.js 的 schema 改成别的然后做 migrations 再运行机器人");

        process.exit();
    }

    getMeInGroup(group: Group) {
        return this.bot.telegram.getChatMember(group.id, this.info.id);
    }
    getMember(groupId: number, memberId: number) {
        return this.bot.telegram.getChatMember(groupId, memberId);
    }
    kickMember(groupId: number, memberId: number) {
        return this.bot.telegram.kickChatMember(groupId, memberId);
    }

    getGroupInfo(group: Group) {
        return this.bot.telegram.getChat(group.id);
    }
    getGroupInfos(groups: Group[]) {
        return Promise.all(groups.map(async group => {
            const groupId = Number(group.id);
            const info = await this.bot.telegram.getChat(groupId);
            if (!info.title) {
                throw new Error("What happened?");
            }

            return info;
        }));
    }

    sendMessage(memberId: number, message: string) {
        return this.bot.telegram.sendMessage(memberId, message, { parse_mode: "Markdown" });
    }
}
