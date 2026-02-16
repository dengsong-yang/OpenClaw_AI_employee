
import { z } from "zod";
import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import type { AnyAgentTool } from "../../src/plugins/types.js";

const OrderCheckSchema = z.object({
  order_id: z.string().describe("The unique order identifier (e.g., 'ORD-123')"),
});

export default function register(api: OpenClawPluginApi) {
  api.registerTool({
    name: "check_order",
    description: "Retrieve current status and details of an order using its ID.",
    inputSchema: OrderCheckSchema,
    run: async ({ order_id }: z.infer<typeof OrderCheckSchema>) => {
      // Mock Implementation for Junior Support Agent
      if (order_id === "12345") {
        return {
          status: "shipped",
          tracking_number: "SF1234567890",
          carrier: "SF Express",
          items: [
            { name: "OpenClaw T-Shirt", size: "L", quantity: 1 },
            { name: "Developer Cap", color: "Black", quantity: 1 }
          ],
          estimated_delivery: "2026-02-20",
          last_update: "Package arrived at distribution center."
        };
      }
      
      if (order_id === "error") {
          throw new Error("Database connection failed (Simulated)");
      }

      return {
        status: "not_found",
        message: `Order ${order_id} could not be found in the system. Please verify the ID.`
      };
    },
  } as unknown as AnyAgentTool, { optional: true });
  
  api.logger.info("Plugin 'ecommerce-order' registered with tool 'check_order'");
}
