// src/test/AgentPage.test.jsx
import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./helpers";
import AgentPage from "../screens/AgentPage";
import { MY_AI_HISTORY } from "../gql/askAI";
import { streamNovaResponse } from "../services/aiStreamClient";

vi.mock("../services/aiStreamClient", () => ({
  streamNovaResponse: vi.fn(),
}));

const emptyHistoryMock = {
  request: { query: MY_AI_HISTORY },
  result: { data: { myAIHistory: [] } },
};

const makeHistoryMock = (history) => ({
  request: { query: MY_AI_HISTORY },
  result: { data: { myAIHistory: history } },
});

describe("AgentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders heading, suggestions, input, and send button", async () => {
    renderWithProviders(<AgentPage />, { mocks: [emptyHistoryMock] });

    expect(screen.getByText(/Ask Nova/i)).toBeInTheDocument();
    expect(screen.getByText("Try asking:")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Browse games" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Quick picks" }),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/ask about games/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
    });
  });

  test("updates one Nova placeholder during streaming instead of appending duplicate bubbles", async () => {
    const prompt =
      "Recommend three games from the platform and explain why each one is worth trying.";
    const answer = "Nova says hello with one streaming response.";

    vi.mocked(streamNovaResponse).mockImplementationOnce(
      async ({ onProgress, onToken, onFinal, onDone }) => {
        onProgress("Nova is loading platform games and community data...");
        onToken("Nova says hello");
        onToken(" with one streaming response.");
        onFinal({ answer, recommendedPosts: [] });
        onDone({ ok: true });
      },
    );

    renderWithProviders(<AgentPage />, {
      mocks: [
        emptyHistoryMock,
        makeHistoryMock([
          {
            role: "user",
            content: prompt,
            createdAt: "2026-06-13T00:00:00.000Z",
          },
          {
            role: "assistant",
            content: answer,
            createdAt: "2026-06-13T00:00:01.000Z",
          },
        ]),
      ],
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Quick picks" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Quick picks" }));

    await waitFor(() => {
      expect(screen.getAllByText(answer)).toHaveLength(1);
    });

    expect(streamNovaResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        message: prompt,
      }),
    );
  });
});
