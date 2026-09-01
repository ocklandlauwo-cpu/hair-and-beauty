<?php

namespace App\Services;

use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class ReportService
{
    public function weeklyPdf(string $from, string $to): Response
    {
        $data = $this->gatherData($from, $to, 'weekly');

        return Pdf::loadView('reports.weekly', $data)
            ->setPaper('a4', 'portrait')
            ->download("weekly-report-{$from}-{$to}.pdf");
    }

    public function monthlyPdf(string $from, string $to): Response
    {
        $data = $this->gatherData($from, $to, 'monthly');

        return Pdf::loadView('reports.monthly', $data)
            ->setPaper('a4', 'portrait')
            ->download("monthly-report-{$from}-{$to}.pdf");
    }

    public function gatherData(string $from, string $to, string $type): array
    {
        $salesByLocation = DB::table('sale_items as si')
            ->join('sales as s', 's.id', '=', 'si.sale_id')
            ->join('locations as l', 'l.id', '=', 's.location_id')
            ->where('s.is_reverted', false)
            ->whereBetween('s.sale_date', [$from, $to])
            ->groupBy('l.id', 'l.name')
            ->select(
                'l.name as location_name',
                DB::raw('COUNT(DISTINCT s.id) as sale_count'),
                DB::raw('SUM(si.unit_price * si.quantity) as revenue'),
                DB::raw('SUM(si.unit_cost * si.quantity) as cogs'),
                DB::raw('SUM((si.unit_price - si.unit_cost) * si.quantity) as gross_profit')
            )
            ->orderBy('l.name')
            ->get();

        $expenses = DB::table('expenses as e')
            ->join('locations as l', 'l.id', '=', 'e.location_id')
            ->where('e.business_line', 'shop')
            ->whereBetween('e.expense_date', [$from, $to])
            ->groupBy('l.id', 'l.name', 'e.category')
            ->select('l.name as location_name', 'e.category', DB::raw('SUM(e.amount) as total'))
            ->orderBy('l.name')
            ->orderBy('e.category')
            ->get();

        $expensesByCategory = DB::table('expenses')
            ->where('business_line', 'shop')
            ->whereBetween('expense_date', [$from, $to])
            ->groupBy('category')
            ->select('category', DB::raw('SUM(amount) as total'))
            ->orderBy('category')
            ->get();

        $totalRevenue = $salesByLocation->sum('revenue');
        $totalCogs = $salesByLocation->sum('cogs');
        $totalGrossProfit = $totalRevenue - $totalCogs;
        $totalExpenses = $expenses->sum('total');
        $netProfit = $totalGrossProfit - $totalExpenses;

        return [
            'from' => $from,
            'to' => $to,
            'generatedAt' => now()->setTimezone('Africa/Dar_es_Salaam')->format('Y-m-d H:i T'),
            'salesByLocation' => $salesByLocation,
            'expenses' => $expenses,
            'expensesByCategory' => $expensesByCategory,
            'totals' => [
                'sale_count' => $salesByLocation->sum('sale_count'),
                'revenue' => $totalRevenue,
                'cogs' => $totalCogs,
                'gross_profit' => $totalGrossProfit,
                'expenses' => $totalExpenses,
                'net_profit' => $netProfit,
            ],
        ];
    }
}
