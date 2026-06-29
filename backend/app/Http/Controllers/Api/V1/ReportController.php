<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ReportService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ReportController extends Controller
{
    public function __construct(private ReportService $reports) {}

    public function weekly(Request $request): Response
    {
        if (! in_array($request->user()->role, ['admin', 'store_keeper'])) {
            abort(403);
        }

        $from = now()->startOfWeek()->toDateString();
        $to = now()->endOfWeek()->toDateString();

        return $this->reports->weeklyPdf($from, $to);
    }

    public function monthly(Request $request): Response
    {
        if (! in_array($request->user()->role, ['admin', 'store_keeper'])) {
            abort(403);
        }

        $from = now()->startOfMonth()->toDateString();
        $to = now()->endOfMonth()->toDateString();

        return $this->reports->monthlyPdf($from, $to);
    }
}
