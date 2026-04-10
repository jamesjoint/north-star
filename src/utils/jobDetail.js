const DIMENSION_LABELS = {
  core_mechanism:       'Connector Fit',
  product_depth:        'Daily Texture',
  regulated_complexity: 'Structural Integrity',
  bd_track_record:      'Visibility',
  mba_preference:       'Pioneering',
  domain_gap:           'Domain Fit',
  gap_bridgeability:    'Gap Bridgeability',
}

export function dimLabel(key) {
  return DIMENSION_LABELS[key]
    || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const PIPELINE = [
  { status: 'Saved',         pct: 0,   label: 'Saved',         next: 'Apply' },
  { status: 'Outreach Sent', pct: 20,  label: 'Outreach',      next: 'Follow Up' },
  { status: 'Applied',       pct: 40,  label: 'Applied',       next: 'Phone Screen' },
  { status: 'Interviewing',  pct: 65,  label: 'Interviewing',  next: 'Final Round' },
  { status: 'Offer',         pct: 88,  label: 'Offer',         next: 'Decision' },
  { status: 'Passed',        pct: 100, label: 'Closed',        next: '—' },
  { status: 'Not Applying',  pct: 0,   label: 'Not Applying',  next: '—' },
  { status: 'Expired',       pct: 100, label: 'Expired',       next: '—' },
]

export function pipelineForStatus(status) {
  return PIPELINE.find(p => p.status === status) || { pct: 0, label: status || 'Saved', next: 'Apply' }
}

/**
 * Build the dimension list for settings/scoring display.
 * If profileDimensions has 3+ keys, convert it to [{key, label, description}].
 * Otherwise fall back to the provided defaults array.
 */
export function buildDimList(profileDimensions, defaults) {
  if (profileDimensions && Object.keys(profileDimensions).length >= 3) {
    return Object.entries(profileDimensions).map(([key, dim]) => ({
      key,
      label: dim.label || key,
      description: dim.description || '',
    }))
  }
  return defaults
}
