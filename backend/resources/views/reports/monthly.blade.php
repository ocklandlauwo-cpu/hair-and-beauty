<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        body  { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #333; }
        h1    { color: #1F3A5F; margin-bottom: 4px; }
        h2    { color: #2E75B6; font-size: 13px; margin: 16px 0 6px; }
        .meta { color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th    { background: #2E75B6; color: #fff; padding: 6px 8px; text-align: left; }
        td    { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; }
        tr:nth-child(even) td { background: #f9f9f9; }
        .total td { font-weight: bold; background: #eef4fb; border-top: 2px solid #2E75B6; }
        .right { text-align: right; }
        .footer { margin-top: 30px; font-size: 10px; color: #999; text-align: center; }
    </style>
</head>
<body>
    <h1>Monthly P&amp;L Report — Hair & Beauty</h1>
    <p class="meta">Period: {{ $from }} to {{ $to }} &nbsp;|&nbsp; Generated: {{ $generatedAt }}</p>

    <h2>Sales Summary by Location</h2>
    <table>
        <thead>
            <tr><th>Location</th><th class="right">Sales Count</th><th class="right">Revenue (TZS)</th><th class="right">COGS (TZS)</th><th class="right">Gross Profit (TZS)</th></tr>
        </thead>
        <tbody>
            @foreach ($salesByLocation as $row)
            <tr>
                <td>{{ $row->location_name }}</td>
                <td class="right">{{ number_format($row->sale_count) }}</td>
                <td class="right">{{ number_format($row->revenue, 0, '.', ',') }}</td>
                <td class="right">{{ number_format($row->cogs, 0, '.', ',') }}</td>
                <td class="right">{{ number_format($row->gross_profit, 0, '.', ',') }}</td>
            </tr>
            @endforeach
            <tr class="total">
                <td>TOTAL</td>
                <td class="right">{{ number_format($totals['sale_count']) }}</td>
                <td class="right">{{ number_format($totals['revenue'], 0, '.', ',') }}</td>
                <td class="right">{{ number_format($totals['cogs'], 0, '.', ',') }}</td>
                <td class="right">{{ number_format($totals['gross_profit'], 0, '.', ',') }}</td>
            </tr>
        </tbody>
    </table>

    <h2>Expenses by Category (All Locations)</h2>
    <table>
        <thead>
            <tr><th>Category</th><th class="right">Amount (TZS)</th></tr>
        </thead>
        <tbody>
            @foreach ($expensesByCategory as $row)
            <tr>
                <td>{{ ucfirst($row->category) }}</td>
                <td class="right">{{ number_format($row->total, 0, '.', ',') }}</td>
            </tr>
            @endforeach
            <tr class="total">
                <td>TOTAL EXPENSES</td>
                <td class="right">{{ number_format($totals['expenses'], 0, '.', ',') }}</td>
            </tr>
        </tbody>
    </table>

    <h2>Monthly P&amp;L</h2>
    <table>
        <tbody>
            <tr><td>Gross Profit</td><td class="right">{{ number_format($totals['gross_profit'], 0, '.', ',') }} TZS</td></tr>
            <tr><td>Total Expenses</td><td class="right">{{ number_format($totals['expenses'], 0, '.', ',') }} TZS</td></tr>
            <tr class="total"><td>Net Profit</td><td class="right">{{ number_format($totals['net_profit'], 0, '.', ',') }} TZS</td></tr>
        </tbody>
    </table>

    <p class="footer">Hair & Beauty Intelligence Platform &mdash; Confidential &mdash; {{ $generatedAt }}</p>
</body>
</html>
