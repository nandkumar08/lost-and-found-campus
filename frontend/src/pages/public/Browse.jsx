import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useUniversity } from '../../context/UniversityContext';
import { CatalogApi, ReportApi } from '../../services/api';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Pagination,
  Select,
  Tabs
} from '../../components/ui';
import { ItemIllustration, iconForCategory } from '../../components/ItemIllustration';
import { formatDate } from '../../utils/format';

const TYPE_TABS = [
  { value: 'lost', label: 'Lost Items' },
  { value: 'found', label: 'Found Items' },
  { value: 'all', label: 'All Items' }
];

export default function Browse() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { active } = useUniversity();

  const typeParam = params.type || 'all';
  const reportType = typeParam === 'all' ? '' : typeParam;

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [categoryId, setCategoryId] = useState(searchParams.get('category') || '');
  const [locationId, setLocationId] = useState(searchParams.get('location') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('from') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('to') || '');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('recent');

  const { data: catalog } = useApi(
    () => Promise.all([CatalogApi.categories(active?.code), CatalogApi.locations(active?.code)]),
    [active?.code]
  );
  const categories = catalog?.[0]?.categories || [];
  const locations = catalog?.[1]?.locations || [];

  const filters = useMemo(
    () => ({
      university_code: active?.code,
      report_type: reportType || undefined,
      category_id: categoryId || undefined,
      location_id: locationId || undefined,
      q: query || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      page,
      page_size: 9,
      sort
    }),
    [active?.code, reportType, categoryId, locationId, query, dateFrom, dateTo, page, sort]
  );

  const { data, loading, error, reload } = useApi(() => ReportApi.browse(filters), [JSON.stringify(filters)]);

  useEffect(() => {
    setPage(1);
  }, [reportType, categoryId, locationId, query, dateFrom, dateTo, sort, active?.code]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (categoryId) next.set('category', categoryId);
    if (locationId) next.set('location', locationId);
    if (dateFrom) next.set('from', dateFrom);
    if (dateTo) next.set('to', dateTo);
    setSearchParams(next, { replace: true });
  }, [query, categoryId, locationId, dateFrom, dateTo, setSearchParams]);

  const items = data?.items || [];
  const activeFilters = [query, categoryId, locationId, dateFrom, dateTo].filter(Boolean).length;

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 56 }}>
      <div className="page-title-row">
        <div>
          <div className="eyebrow-text">{active?.name || 'Campus registry'}</div>
          <h1 className="page-title">
            {typeParam === 'lost' ? 'Lost items' : typeParam === 'found' ? 'Found items' : 'Campus item registry'}
          </h1>
          <p className="page-subtitle">
            Sanitised public listings. Confidential marks, contact details and vault storage locations are
            withheld until a claim is verified by a custody officer.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => navigate('/report/lost')}>
            Report lost
          </Button>
          <Button variant="forest" onClick={() => navigate('/report/found')}>
            Report found
          </Button>
        </div>
      </div>

      <Tabs
        value={typeParam}
        onChange={(value) => navigate(`/browse/${value}`)}
        tabs={TYPE_TABS}
      />

      <div className="filter-bar" style={{ marginTop: 16 }}>
        <div className="field-group filter-search">
          <Field label="Search">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Item name, description, brand, report ID…"
              aria-label="Search reports"
            />
          </Field>
        </div>
        <div className="field-group">
          <Field label="Category">
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="field-group">
          <Field label="Location">
            <Select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">All locations</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="field-group">
          <Field label="From date">
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </Field>
        </div>
        <div className="field-group">
          <Field label="To date">
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </Field>
        </div>
        <div className="field-group">
          <Field label="Sort">
            <Select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="recent">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="incident">Incident date</option>
            </Select>
          </Field>
        </div>
        {activeFilters > 0 ? (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery('');
              setCategoryId('');
              setLocationId('');
              setDateFrom('');
              setDateTo('');
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {loading ? <Loading rows={3} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No matching reports"
          message="Try widening your filters, or file a report so the registry can start matching it."
          action={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <Button variant="primary" onClick={() => navigate('/report/lost')}>
                Report lost item
              </Button>
              <Button variant="secondary" onClick={() => navigate('/report/found')}>
                Report found item
              </Button>
            </div>
          }
        />
      ) : null}

      <div className="grid-3">
        {items.map((item) => (
          <Card key={item.id} className="card-hover item-card">
            <ItemIllustration iconType={iconForCategory(item.category)} imageUrl={item.images?.[0]?.url} alt={item.title} />
            <div className="item-body">
              <div className="item-topline">
                <span className={`badge ${item.report_type === 'lost' ? 'badge-lost' : 'badge-found'}`}>
                  <span className="badge-dot" />
                  {item.report_type === 'lost' ? 'Lost' : 'Found'}
                </span>
                <span className="tabular mono xs muted">{item.report_code}</span>
              </div>
              <h3 className="item-title">{item.title}</h3>
              <div className="item-meta">{item.category || 'Uncategorised'} • {item.colour || 'Colour not stated'}</div>
              <div className="item-meta">{item.location || 'Location not specified'}</div>
              <div className="item-meta tabular xs">
                {item.report_type === 'lost' ? 'Lost on' : 'Found on'} {formatDate(item.incident_date)} • {item.status_label}
              </div>
              <div className="item-footer">
                <Button variant="secondary" size="sm" style={{ width: '100%' }} onClick={() => navigate(`/items/${item.report_code}`)}>
                  View details
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Pagination pagination={data?.pagination} onPage={setPage} />
    </div>
  );
}
