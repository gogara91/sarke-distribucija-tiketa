import { ChangeEvent, ClipboardEvent, JSX, useMemo, useState } from "react";
import Papa from "papaparse";

type TicketType = "AT" | "CH" | "DE";
type AgentGroup = "AT" | "AT_CH" | "CH_DE" | "AT_CH_DE";

type TicketRecord = {
  rowId: string;
  data: Record<string, unknown>;
};

type AgentInput = {
  localId: string;
  name: string;
};

type AgentWithMeta = AgentInput & {
  group: AgentGroup;
  assigned: number;
};

type AssignmentResult = {
  byAgent: Array<{
    name: string;
    group: AgentGroup;
    total: number;
    at: number;
    ch: number;
    de: number;
    tickets: string[];
  }>;
  unassigned: {
    AT: number;
    CH: number;
    DE: number;
  };
};

const GROUP_LABELS: Record<AgentGroup, string> = {
  AT: "AT only",
  AT_CH: "AT / CH",
  CH_DE: "CH / DE",
  AT_CH_DE: "AT / CH / DE"
};

const AGENT_GROUPS: AgentGroup[] = ["AT", "AT_CH", "CH_DE", "AT_CH_DE"];

const ELIGIBILITY: Record<TicketType, AgentGroup[]> = {
  AT: ["AT", "AT_CH", "AT_CH_DE"],
  CH: ["AT_CH", "CH_DE", "AT_CH_DE"],
  DE: ["CH_DE", "AT_CH_DE"]
};

const INITIAL_ROW = (): AgentInput => ({
  localId: crypto.randomUUID(),
  name: ""
});

const parseCsvFile = (file: File): Promise<TicketRecord[]> =>
  new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const blockingErrors = results.errors.filter(
          (entry) => entry.code !== "UndetectableDelimiter"
        );

        if (blockingErrors.length > 0) {
          reject(
            new Error(
              `CSV parsing failed: ${blockingErrors
                .map((entry) => entry.message)
                .join(", ")}`
            )
          );
          return;
        }

        const rows = results.data.map((data, index) => ({
          rowId: `${file.name}-${index}`,
          data
        }));
        resolve(rows);
      },
      error: (error) => {
        reject(error);
      }
    });
  });

const getTicketName = (ticket: TicketRecord): string => {
  const firstValue = Object.values(ticket.data).find((value) => {
    if (value === null || value === undefined) {
      return false;
    }

    return String(value).trim().length > 0;
  });

  return firstValue ? String(firstValue).trim() : ticket.rowId;
};

const escapeCsvCell = (value: string): string => `"${value.replaceAll(`"`, `""`)}"`;

const App = (): JSX.Element => {
  const [tickets, setTickets] = useState<Record<TicketType, TicketRecord[]>>({
    AT: [],
    CH: [],
    DE: []
  });
  const [ticketFiles, setTicketFiles] = useState<Record<TicketType, string>>({
    AT: "",
    CH: "",
    DE: ""
  });
  const [agents, setAgents] = useState<Record<AgentGroup, AgentInput[]>>({
    AT: [INITIAL_ROW()],
    AT_CH: [INITIAL_ROW()],
    CH_DE: [INITIAL_ROW()],
    AT_CH_DE: [INITIAL_ROW()]
  });
  const [errors, setErrors] = useState<string[]>([]);

  const allAgents = useMemo(() => {
    const merged: AgentWithMeta[] = [];

    AGENT_GROUPS.forEach((group) => {
      agents[group].forEach((agent) => {
        const hasAnyInput = agent.name.trim();
        if (!hasAnyInput) {
          return;
        }

        merged.push({
          ...agent,
          group,
          assigned: 0
        });
      });
    });

    return merged;
  }, [agents]);

  const onUpload = async (
    ticketType: TicketType,
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const [file] = Array.from(event.target.files ?? []);
    if (!file) {
      return;
    }

    try {
      const rows = await parseCsvFile(file);
      setTickets((previous) => ({ ...previous, [ticketType]: rows }));
      setTicketFiles((previous) => ({ ...previous, [ticketType]: file.name }));
      setErrors((previous) =>
        previous.filter((entry) => !entry.includes(`[${ticketType}]`))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors((previous) => [
        ...previous.filter((entry) => !entry.includes(`[${ticketType}]`)),
        `[${ticketType}] ${message}`
      ]);
    }
  };

  const updateAgentField = (
    group: AgentGroup,
    localId: string,
    value: string
  ): void => {
    setAgents((previous) => ({
      ...previous,
      [group]: previous[group].map((entry) =>
        entry.localId === localId ? { ...entry, name: value } : entry
      )
    }));
  };

  const addAgentRow = (group: AgentGroup): void => {
    setAgents((previous) => ({
      ...previous,
      [group]: [...previous[group], INITIAL_ROW()]
    }));
  };

  const removeAgentRow = (group: AgentGroup, localId: string): void => {
    setAgents((previous) => {
      const filtered = previous[group].filter((entry) => entry.localId !== localId);
      return {
        ...previous,
        [group]: filtered.length > 0 ? filtered : [INITIAL_ROW()]
      };
    });
  };

  const handleBulkPaste = (
    group: AgentGroup,
    event: ClipboardEvent<HTMLTextAreaElement>
  ): void => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text");
    const names = pasted
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (names.length === 0) {
      return;
    }

    const rows = names.map((name) => ({
      localId: crypto.randomUUID(),
      name
    }));

    setAgents((previous) => ({
      ...previous,
      [group]: [...previous[group].filter((row) => row.name), ...rows]
    }));
  };

  const assignment = useMemo<AssignmentResult>(() => {
    const byAgent = allAgents.map((agent) => ({
      ...agent,
      at: 0,
      ch: 0,
      de: 0,
      tickets: [] as string[]
    }));

    const unassigned = { AT: 0, CH: 0, DE: 0 };

    const assignOne = (ticketType: TicketType, ticket: TicketRecord): void => {
      const eligibleGroups = ELIGIBILITY[ticketType];

      const candidates = byAgent.filter((agent) => eligibleGroups.includes(agent.group));
      if (candidates.length === 0) {
        unassigned[ticketType] += 1;
        return;
      }

      candidates.sort((left, right) => {
        if (left.assigned !== right.assigned) {
          return left.assigned - right.assigned;
        }
        const leftName = left.name.trim().toLowerCase();
        const rightName = right.name.trim().toLowerCase();
        return leftName.localeCompare(rightName);
      });

      const selected = candidates[0];
      selected.assigned += 1;
      selected.tickets.push(getTicketName(ticket));
      if (ticketType === "AT") selected.at += 1;
      if (ticketType === "CH") selected.ch += 1;
      if (ticketType === "DE") selected.de += 1;
    };

    const ticketQueue: Array<{ type: TicketType; ticket: TicketRecord }> = [
      ...tickets.DE.map((ticket) => ({ type: "DE" as const, ticket })),
      ...tickets.AT.map((ticket) => ({ type: "AT" as const, ticket })),
      ...tickets.CH.map((ticket) => ({ type: "CH" as const, ticket }))
    ];

    ticketQueue.forEach(({ type, ticket }) => assignOne(type, ticket));

    return {
      byAgent: byAgent
        .map((entry) => ({
          name: entry.name || "Unnamed",
          group: entry.group,
          total: entry.assigned,
          at: entry.at,
          ch: entry.ch,
          de: entry.de,
          tickets: entry.tickets
        }))
        .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name)),
      unassigned
    };
  }, [allAgents, tickets]);

  const exportDistributionCsv = (): void => {
    if (assignment.byAgent.length === 0) {
      return;
    }

    const header = assignment.byAgent.map((agent) => escapeCsvCell(agent.name)).join(",");
    const maxTicketRows = Math.max(...assignment.byAgent.map((agent) => agent.tickets.length), 0);

    const lines = [header];
    for (let index = 0; index < maxTicketRows; index += 1) {
      const row = assignment.byAgent
        .map((agent) => escapeCsvCell(agent.tickets[index] ?? ""))
        .join(",");
      lines.push(row);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ticket-distribution.csv";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="page">
      <header>
        <h1>CSV Ticket Balancer</h1>
        <p>Upload AT / CH / DE ticket CSVs and spread tickets as evenly as possible.</p>
      </header>

      <section className="grid uploads">
        {(["AT", "CH", "DE"] as TicketType[]).map((type) => (
          <article className="card" key={type}>
            <h2>{type} tickets</h2>
            <input type="file" accept=".csv,text/csv" onChange={(event) => void onUpload(type, event)} />
            <p className="meta">
              {ticketFiles[type] ? `File: ${ticketFiles[type]}` : "No CSV selected"}
            </p>
            <p className="meta">Rows loaded: {tickets[type].length}</p>
          </article>
        ))}
      </section>

      {errors.length > 0 && (
        <section className="card error">
          <h2>CSV errors</h2>
          <ul>
            {errors.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="agents">
        <h2>Customer support agents</h2>
        <p>Enter agent names manually, or paste a list of names (one per line) for each capability group.</p>

        <div className="grid agent-sections">
          {AGENT_GROUPS.map((group) => (
            <article className="card" key={group}>
              <h3>{GROUP_LABELS[group]}</h3>

              <textarea
                className="paste-box"
                placeholder="Paste agent names here (one per line)"
                onPaste={(event) => handleBulkPaste(group, event)}
              />

              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {agents[group].map((agent) => (
                    <tr key={agent.localId}>
                      <td>
                        <input
                          value={agent.name}
                          onChange={(event) =>
                            updateAgentField(group, agent.localId, event.target.value)
                          }
                          placeholder="Agent name"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => removeAgentRow(group, agent.localId)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button type="button" onClick={() => addAgentRow(group)}>
                Add row
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Distribution result</h2>
        <p className="meta">
          Unassigned tickets: AT {assignment.unassigned.AT}, CH {assignment.unassigned.CH}, DE{" "}
          {assignment.unassigned.DE}
        </p>
        <button type="button" onClick={exportDistributionCsv} disabled={assignment.byAgent.length === 0}>
          Export distribution CSV
        </button>

        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Capability</th>
              <th>Total</th>
              <th>AT</th>
              <th>CH</th>
              <th>DE</th>
            </tr>
          </thead>
          <tbody>
            {assignment.byAgent.length === 0 ? (
              <tr>
                <td colSpan={6}>No agents entered yet.</td>
              </tr>
            ) : (
              assignment.byAgent.map((entry) => (
                <tr key={`${entry.group}-${entry.name}`}>
                  <td>{entry.name}</td>
                  <td>{GROUP_LABELS[entry.group]}</td>
                  <td>{entry.total}</td>
                  <td>{entry.at}</td>
                  <td>{entry.ch}</td>
                  <td>{entry.de}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
};

export default App;
