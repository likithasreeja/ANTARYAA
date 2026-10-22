import React from 'react';

export function SkeletonBox({ width = '100%', height = 24, borderRadius = 8, style = {} }) {
  return (
    <div
      className="skeleton-shimmer"
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%)',
        backgroundSize: '200% 100%',
        animation: 'skeletonShimmer 1.5s infinite linear',
        ...style
      }}
    />
  );
}

export function SkeletonCard({ lines = 2, height = 80 }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 12, border: '1px solid var(--glass-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <SkeletonBox width={40} height={40} borderRadius={20} />
        <div style={{ flex: 1 }}>
          <SkeletonBox width="60%" height={16} style={{ marginBottom: 6 }} />
          <SkeletonBox width="35%" height={12} />
        </div>
      </div>
      {lines > 1 && <SkeletonBox width="90%" height={14} style={{ marginTop: 8 }} />}
    </div>
  );
}

export function SkeletonList({ count = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonStatGrid({ count = 2 }) {
  return (
    <div className="stats-grid" style={{ marginBottom: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat-card" style={{ padding: 16 }}>
          <SkeletonBox width="50%" height={12} style={{ marginBottom: 10 }} />
          <SkeletonBox width="70%" height={26} />
        </div>
      ))}
    </div>
  );
}
