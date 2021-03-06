import { MessageHandlerContext, ParameterInfo, ControllerMethodContext } from "#/definitions";
import { MetadataKeys, Injections, ParameterTypes } from "#/constants";
import { IBackendApiService } from "#/services";

type HandlerFunc = (ctx: MessageHandlerContext, ...args: any[]) => any;

export function RequireMintedMinetoken(): MethodDecorator {
    return (target: Object, methodName: string | symbol, descriptor: PropertyDescriptor) => {
        if (typeof methodName === "symbol") {
            throw new Error("Impossible situation");
        }

        const decoratedMethod = <HandlerFunc>descriptor.value;

        let index: number = -1;

        const map = Reflect.getMetadata(MetadataKeys.Parameters, target.constructor) as Map<string, Map<number, ParameterInfo>> | undefined;
        if (map) {
            const parameters = map.get(methodName);
            if (parameters) {
                for (const [parameterIndex, info] of parameters) {
                    if (info.type !== ParameterTypes.SenderMatatakiInfo) {
                        continue;
                    }

                    index = parameterIndex;
                }
            }
        }

        descriptor.value = async function (ctx: MessageHandlerContext, ...args: any[]) {
            const context = Reflect.getMetadata(MetadataKeys.Context, ctx) as ControllerMethodContext;
            const backendService = context.container.get<IBackendApiService>(Injections.BackendApiService);

            try {
                const user = await backendService.getUserByTelegramId(ctx.message.from.id);

                if (user.issuedTokens.length === 0) {
                    throw new Error();
                }

                if (index !== -1) {
                    args[index - 1] = user;
                }

                return decoratedMethod.call(this, ctx, ...args);
            } catch {
                await ctx.reply(ctx.i18n.t("error.requireMatatakiAccount"));
                return;
            }
        };

        Object.defineProperty(descriptor.value, "name", { value: methodName });
    };
}
