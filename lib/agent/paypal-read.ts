import "server-only";
/**
 * The PayPal Agent Toolkit's READ tools for the agents (list_transactions, get_order), bound to this app's PayPal
 * credentials. Only these two are exposed: no tool that moves money comes from the toolkit; the engine does that.
 */
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { paypalConfig } from "../paypal/http";

type Exec = (args: Record<string, unknown>, opts: { toolCallId: string; messages: [] }) => Promise<unknown>;

export function paypalReadTools(): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  const c = paypalConfig();
  const kit = new PayPalAgentToolkit({
    clientId: c.clientId,
    clientSecret: c.clientSecret,
    configuration: { actions: { transactions: { list: true }, orders: { get: true } }, context: { sandbox: c.env === "sandbox" } },
  });
  const tools = kit.getTools() as Record<string, { execute?: Exec }>;
  const bind = (name: string) => async (args: Record<string, unknown>) => {
    const t = tools[name];
    if (!t?.execute) throw new Error(`the PayPal toolkit has no ${name} tool`);
    return t.execute(args, { toolCallId: `${name}-${Date.now()}`, messages: [] });
  };
  return { list_transactions: bind("list_transactions"), get_order: bind("get_order") };
}
