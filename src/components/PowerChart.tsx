import { useEffect, useRef } from "react";
import { Chart } from "chart.js/auto";
import { UsageHistoryPoint } from "../types";

interface PowerChartProps {
  history: UsageHistoryPoint[];
}

export default function PowerChart({ history }: PowerChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Destroy existing chart instance to prevent duplicate canvases
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    // Sort history points by hour (chronological order)
    const sortedHistory = [...history].sort((a, b) => {
      return a.hour.localeCompare(b.hour);
    });

    const labels = sortedHistory.map(h => h.hour);
    const energyData = sortedHistory.map(h => h.energy);
    const costData = sortedHistory.map(h => h.cost);

    chartInstanceRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Energy Consumption (kWh)",
            data: energyData,
            borderColor: "rgb(245, 158, 11)", // warm amber
            backgroundColor: "rgba(245, 158, 11, 0.1)",
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            yAxisID: "y-energy",
          },
          {
            label: "Simulated Cost (৳)",
            data: costData,
            borderColor: "rgb(16, 185, 129)", // emerald green
            backgroundColor: "rgba(16, 185, 129, 0.05)",
            fill: false,
            tension: 0.3,
            borderWidth: 1.5,
            borderDash: [5, 5],
            pointRadius: 3,
            pointHoverRadius: 5,
            yAxisID: "y-cost",
          }
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: "#9ca3af", // gray-400
              font: {
                family: "Inter, system-ui, sans-serif",
                size: 11,
              }
            }
          },
          tooltip: {
            backgroundColor: "rgba(17, 24, 39, 0.95)",
            titleColor: "#f3f4f6",
            bodyColor: "#f3f4f6",
            borderColor: "#374151",
            borderWidth: 1,
            padding: 10,
            cornerRadius: 6,
          },
        },
        scales: {
          x: {
            grid: {
              color: "rgba(75, 85, 99, 0.1)", // subtle grid
            },
            ticks: {
              color: "#9ca3af",
              font: {
                family: "JetBrains Mono, monospace",
                size: 10,
              }
            }
          },
          "y-energy": {
            type: "linear",
            display: true,
            position: "left",
            grid: {
              color: "rgba(75, 85, 99, 0.15)",
            },
            ticks: {
              color: "#f59e0b",
              font: {
                family: "JetBrains Mono, monospace",
                size: 10,
              }
            },
            title: {
              display: true,
              text: "Energy (kWh)",
              color: "#f59e0b",
              font: {
                size: 11,
                weight: "bold"
              }
            }
          },
          "y-cost": {
            type: "linear",
            display: true,
            position: "right",
            grid: {
              drawOnChartArea: false, // only show grid lines for left axis
            },
            ticks: {
              color: "#10b981",
              font: {
                family: "JetBrains Mono, monospace",
                size: 10,
              }
            },
            title: {
              display: true,
              text: "Cost (৳)",
              color: "#10b981",
              font: {
                size: 11,
                weight: "bold"
              }
            }
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [history]);

  return (
    <div className="relative w-full h-[280px]">
      <canvas id="power_chart" ref={canvasRef} />
    </div>
  );
}
