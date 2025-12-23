import { toast } from "@/shadcn/hooks/use-toast";
import { hasAccess } from "@/shadcn/lib/hasAccess";
import { Switch } from "@headlessui/react";
import { getCookie } from "cookies-next";
import { useState } from "react";
import { useQuery } from "react-query";

async function getHooks() {
  const res = await fetch(`/api/v1/webhooks/all`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getCookie("session")}`,
    },
  });

  hasAccess(res);

  return res.json(); // Return the parsed JSON response
}

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

// Webhook type definitions with conditions
const webhookTypes = [
  {
    value: "ticket_created",
    label: "Ticket Created (All)",
    description: "Fires when any ticket is created",
    conditions: ["All sources", "Manual + IMAP + API"],
  },
  {
    value: "customer_ticket_created",
    label: "Customer Ticket Created",
    description: "Fires ONLY when customer sends email (via IMAP)",
    conditions: ["fromImap = true", "End user is customer"],
  },
  {
    value: "customer_reply_received",
    label: "Customer Reply Received",
    description: "Fires ONLY when customer replies to existing ticket",
    conditions: ["Email reply detected", "Appended as comment"],
  },
  {
    value: "ticket_status_changed",
    label: "Ticket Status Changed",
    description: "Fires when ticket status is updated",
    conditions: ["Status changes", "Open/Closed"],
  },
];

export default function Notifications() {
  const [show, setShow] = useState("main");
  const [enabled, setEnabled] = useState(true);
  const [url, setUrl] = useState("");
  const [type, setType] = useState("customer_ticket_created");
  const [secret, setSecret] = useState();
  const [name, setName] = useState("");

  const { data, status, error, refetch } = useQuery("gethooks", getHooks);

  // Get current type info
  const selectedType = webhookTypes.find((t) => t.value === type);

  async function addHook() {
    await fetch(`/api/v1/webhook/create`, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getCookie("session")}`,
      },
      body: JSON.stringify({
        name,
        active: enabled,
        url,
        type,
        secret,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          refetch();
          setShow("main");
        } else {
          toast({
            variant: "destructive",
            title: "Error -> Unable to add",
            description: res.message,
          });
        }
      });
  }

  async function deleteHook(id) {
    await fetch(`/api/v1/admin/webhook/${id}/delete`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getCookie("session")}`,
      },
    })
      .then((res) => res.json())
      .then((res) => {
        refetch();
        if (res.error) {
          alert(res.error);
        }
      });
  }

  // Helper to get type label for display
  function getTypeLabel(typeValue: string) {
    const found = webhookTypes.find((t) => t.value === typeValue);
    return found ? found.label : typeValue;
  }

  return (
    <main className="flex-1">
      <div className="relative max-w-4xl mx-auto md:px-8 xl:px-0">
        <div className="pt-10 pb-16 ">
          <div className="divide-y-2">
            <div className="px-4 sm:px-6 md:px-0">
              <h1 className="text-3xl font-extrabold text-foreground">
                Webhook Settings
              </h1>
            </div>

          </div>
          <div className="px-4 sm:px-6 md:px-0">
            <div className="py-6">
              <div className="mt-4">
                <div className={show === "main" ? "" : "hidden"}>
                  {status === "success" && (
                    <>
                      <div className="px-4 sm:px-6 md:px-0">
                        <div className="sm:flex sm:items-center mt-4">
                          <div className="sm:flex-auto">
                            <p className="mt-2 text-sm text-foreground">
                              Webhooks allow external services to be notified when certain
                              events happen. When the specified events happen, we'll send
                              a POST request to each of the URLs you provide.
                            </p>
                          </div>
                          <div className="sm:ml-16 sm:flex-none">
                            <>
                              <button
                                onClick={() => setShow("create")}
                                type="button"
                                className={
                                  show === "main"
                                    ? "rounded bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                    : "hidden"
                                }
                              >
                                Add Webhook
                              </button>
                              <button
                                onClick={() => setShow("main")}
                                type="button"
                                className={
                                  show === "main"
                                    ? "hidden"
                                    : "rounded bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                }
                              >
                                Cancel
                              </button>
                            </>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4">
                        {data !== undefined && data.webhooks.length > 0 ? (
                          <div className="flex flex-col gap-4">
                            {data.webhooks.map((hook) => (
                              <div
                                key={hook.id}
                                className="rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm flex items-center space-x-3"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground">
                                    {hook.name}
                                  </p>
                                  <p className="text-sm text-foreground truncate">
                                    {hook.url}
                                  </p>
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                                    {getTypeLabel(hook.type)}
                                  </span>
                                </div>
                                <div className="flex justify-end">
                                  <button
                                    onClick={() => deleteHook(hook.id)}
                                    type="button"
                                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-foreground">
                            You currently have no web hooks added
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className={show === "create" ? "" : "hidden"}>
                  <div className="flex flex-col">
                    <div className="">
                      <div className="space-y-4">
                        <label
                          htmlFor="email"
                          className="block text-sm font-medium text-foreground"
                        >
                          Webhook Name
                        </label>
                        <div className="mt-1">
                          <input
                            type="text"
                            name="url"
                            id="url"
                            className="shadow-sm bg-transparent text-foreground border focus:ring-green\-500 focus:border-green-500 block w-full sm:w-1/2 md:w-3/4 sm:text-sm border-gray-300 rounded-md"
                            required
                            onChange={(e) => setName(e.target.value)}
                          />
                        </div>

                        <label
                          htmlFor="email"
                          className="block text-sm font-medium text-foreground pt-4"
                        >
                          Payload Url
                        </label>
                        <div className="mt-1">
                          <input
                            type="text"
                            name="url"
                            id="url"
                            className="shadow-sm bg-transparent text-foreground border focus:ring-green\-500  focus:border-green-500 block w-full sm:w-1/2 md:w-3/4 sm:text-sm border-gray-300 rounded-md"
                            required
                            onChange={(e) => setUrl(e.target.value)}
                          />
                        </div>

                        <div className="w-3/4">
                          <label
                            htmlFor="location"
                            className="mt-4 block text-sm font-medium text-foreground"
                          >
                            Event Type
                          </label>
                          <select
                            id="location"
                            name="location"
                            className="mt-1 block w-full pl-3 pr-10 bg-transparent border py-2 text-foreground text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                            defaultValue="customer_ticket_created"
                            onChange={(e) => setType(e.target.value)}
                          >
                            {webhookTypes.map((wt) => (
                              <option key={wt.value} value={wt.value}>
                                {wt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Conditions Info Box */}
                        {selectedType && (
                          <div className="w-3/4 mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
                            <h4 className="text-sm font-medium text-blue-800 mb-2">
                              Trigger Conditions
                            </h4>
                            <p className="text-sm text-blue-700 mb-2">
                              {selectedType.description}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {selectedType.conditions.map((condition, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800"
                                >
                                  ✓ {condition}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="pt-8">
                          <Switch.Group
                            as="div"
                            className="flex items-center justify-between"
                          >
                            <span className="flex-grow flex flex-row">
                              <Switch.Label
                                as="span"
                                className="text-sm font-medium text-foreground w-1/6"
                                passive
                              >
                                Active
                              </Switch.Label>
                              <Switch
                                checked={enabled}
                                onChange={setEnabled}
                                className={classNames(
                                  enabled ? "bg-green-600" : "bg-gray-200",
                                  "relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                )}
                              >
                                <span
                                  aria-hidden="true"
                                  className={classNames(
                                    enabled ? "translate-x-5" : "translate-x-0",
                                    "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200"
                                  )}
                                />
                              </Switch>
                            </span>
                          </Switch.Group>
                        </div>

                        <button
                          onClick={() => {
                            addHook();
                          }}
                          type="button"
                          className="mt-8 inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                          Add Webhook
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

