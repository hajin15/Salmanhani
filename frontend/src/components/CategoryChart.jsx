import { useEffect, useRef } from 'react';
import styled from '@emotion/styled';
import gsap from 'gsap';
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import { color } from '../styles.jsx';
import { dur } from '../lib.js';

// 쓰는 부품만 등록해서 번들을 줄인다
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);
Chart.defaults.font.family = "'Pretendard Variable', Pretendard, sans-serif";

// 항목별 점수(가로 막대). 막대가 차오르는 움직임은 Chart.js 기본 애니메이션 대신 GSAP으로.
export default function CategoryChart({ categories }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const cats = Object.values(categories);
    const target = cats.map((c) => c.pct);
    const values = target.map(() => 0);

    const chart = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: cats.map((c) => c.label),
        datasets: [{
          data: values,
          backgroundColor: color.ink,
          borderRadius: 3,
          barThickness: 6,
        }],
      },
      options: {
        indexAxis: 'y',
        animation: false,
        maintainAspectRatio: false,
        scales: {
          x: { min: 0, max: 100, grid: { color: color.rule }, border: { display: false }, ticks: { color: color.ink2 } },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: color.ink, font: { size: 14 } } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${cats[ctx.dataIndex].score}/${cats[ctx.dataIndex].max}점` } },
        },
      },
    });

    // values 배열을 직접 트윈하고, 매 프레임 애니메이션 없이 다시 그린다
    const tween = gsap.to(values, {
      endArray: target,
      duration: dur(0.9),
      ease: 'power3.out',
      onUpdate: () => chart.update('none'),
    });

    return () => { tween.kill(); chart.destroy(); };
  }, [categories]);

  return (
    <Box>
      <canvas ref={canvasRef} role="img" aria-label="항목별 점수 막대 그래프" />
      {/* 스크린 리더용 숫자 */}
      <ul>
        {Object.entries(categories).map(([key, c]) => (
          <li key={key}>{c.label} {c.score}/{c.max}</li>
        ))}
      </ul>
    </Box>
  );
}

const Box = styled.div`
  position: relative;
  height: 260px;
  margin-top: 14px;
  ul {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
`;
