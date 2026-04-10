/**
 * Custom Plugin Entry Point
 *
 * This file is where you can define custom actions, providers, and evaluators
 * for your ElizaOS agent. Add your logic here and reference this plugin in
 * your character file.
 *
 * ElizaOS Plugin Docs: https://elizaos.github.io/eliza/docs/core/plugins
 */

import { type Plugin, type Action, type IAgentRuntime, type Memory, type State } from "@elizaos/core";

/**
 * Example custom action.
 * Replace this with your own action logic.
 */
const exampleAction: Action = {
  name: "EXAMPLE_ACTION",
  description: "An example action — replace with your own.",
  similes: ["DEMO", "SAMPLE"],
  validate: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => true,
  handler: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
    console.log("Custom action triggered");
  },
  examples: [],
};

/**
 * Your custom plugin.
 * Add this plugin's name to the `plugins` array in your character file
 * to activate it.
 */
export const customPlugin: Plugin = {
  name: "custom-plugin",
  description: "My custom ElizaOS plugin",
  actions: [exampleAction],
  providers: [],
  evaluators: [],
};

export default customPlugin;
