<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreBankDepositRequest;
use App\Http\Requests\Api\V1\StoreBankWithdrawalRequest;
use App\Models\BankDeposit;
use App\Models\BankWithdrawal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BankController extends Controller
{
    /** Daily sales per shop with payment-method split and cash deposit status. */
    public function salesReport(Request $request): JsonResponse
    {
        $this->authorize('viewAny', BankDeposit::class);
        $validated = $request->validate([
            'from'        => ['required', 'date'],
            'to'          => ['required', 'date', 'after_or_equal:from'],
            'location_id' => ['nullable', 'integer'],
        ]);

        $locationId = $validated['location_id'] ?? null;

        $rows = DB::select("
            SELECT
                s.sale_date::date AS sale_date,
                l.id AS location_id,
                l.name AS location_name,
                COUNT(*) AS sales_count,
                SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount ELSE 0 END) AS cash,
                SUM(CASE WHEN s.payment_method = 'nmb' THEN s.total_amount ELSE 0 END) AS nmb,
                SUM(CASE WHEN s.payment_method IN ('airtel', 'vodacom', 'tigo') THEN s.total_amount ELSE 0 END) AS mobile,
                SUM(s.total_amount) AS total,
                bd.id AS deposit_id,
                bd.amount AS deposit_amount,
                bd.slip_reference,
                bd.verified_at,
                u.name AS verified_by_name
            FROM sales s
            JOIN locations l ON l.id = s.location_id
            LEFT JOIN bank_deposits bd ON bd.location_id = s.location_id AND bd.deposit_date = s.sale_date::date
            LEFT JOIN users u ON u.id = bd.verified_by
            WHERE s.is_reverted = false
              AND s.sale_date::date BETWEEN ? AND ?
              AND (?::bigint IS NULL OR s.location_id = ?::bigint)
            GROUP BY s.sale_date::date, l.id, l.name, bd.id, bd.amount, bd.slip_reference, bd.verified_at, u.name
            ORDER BY s.sale_date::date DESC, l.name
        ", [$validated['from'], $validated['to'], $locationId, $locationId]);

        $fmt = fn ($v) => number_format((float) $v, 2, '.', '');

        return response()->json(['data' => collect($rows)->map(fn ($r) => [
            'sale_date'     => $r->sale_date,
            'location_id'   => (int) $r->location_id,
            'location_name' => $r->location_name,
            'sales_count'   => (int) $r->sales_count,
            'cash'          => $fmt($r->cash),
            'nmb'           => $fmt($r->nmb),
            'mobile'        => $fmt($r->mobile),
            'total'         => $fmt($r->total),
            'deposit'       => $r->deposit_id ? [
                'id'               => (int) $r->deposit_id,
                'amount'           => $fmt($r->deposit_amount),
                'slip_reference'   => $r->slip_reference,
                'verified_at'      => $r->verified_at,
                'verified_by_name' => $r->verified_by_name,
            ] : null,
        ])->values()]);
    }

    /** Verify that a shop's cash sales for a day were banked; the amount is snapshotted now. */
    public function storeDeposit(StoreBankDepositRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $exists = BankDeposit::where('location_id', $validated['location_id'])
            ->whereDate('deposit_date', $validated['deposit_date'])
            ->exists();
        if ($exists) {
            return response()->json(['message' => 'This deposit has already been verified.'], 422);
        }

        $cash = (float) DB::table('sales')
            ->where('location_id', $validated['location_id'])
            ->whereDate('sale_date', $validated['deposit_date'])
            ->where('payment_method', 'cash')
            ->where('is_reverted', false)
            ->sum('total_amount');
        if ($cash <= 0) {
            return response()->json(['message' => 'There are no cash sales to deposit for this day.'], 422);
        }

        $deposit = BankDeposit::create([
            'location_id'    => $validated['location_id'],
            'deposit_date'   => $validated['deposit_date'],
            'amount'         => $cash,
            'slip_reference' => $validated['slip_reference'] ?? null,
            'verified_by'    => $request->user()->id,
            'verified_at'    => now(),
        ]);

        return response()->json(['data' => [
            'id'             => $deposit->id,
            'amount'         => number_format($cash, 2, '.', ''),
            'slip_reference' => $deposit->slip_reference,
        ]], 201);
    }

    /** Unverify a deposit (undo a mistaken verification). */
    public function destroyDeposit(BankDeposit $bankDeposit): JsonResponse
    {
        $this->authorize('delete', $bankDeposit);
        $bankDeposit->delete();

        return response()->json(null, 204);
    }

    public function storeWithdrawal(StoreBankWithdrawalRequest $request): JsonResponse
    {
        $withdrawal = BankWithdrawal::create([
            ...$request->validated(),
            'recorded_by' => $request->user()->id,
        ]);

        return response()->json(['data' => $this->presentWithdrawal($withdrawal)], 201);
    }

    /** Money In (verified deposits), Money Out (withdrawals) and the resulting current amount. */
    public function summary(): JsonResponse
    {
        $this->authorize('viewAny', BankDeposit::class);

        $moneyIn  = (float) BankDeposit::sum('amount');
        $moneyOut = (float) BankWithdrawal::sum('amount');
        $fmt = fn ($v) => number_format($v, 2, '.', '');

        return response()->json(['data' => [
            'money_in'           => $fmt($moneyIn),
            'money_out'          => $fmt($moneyOut),
            'current_amount'     => $fmt($moneyIn - $moneyOut),
            'recent_withdrawals' => BankWithdrawal::latest('withdrawal_date')->latest('id')->limit(5)->get()
                ->map(fn ($w) => $this->presentWithdrawal($w)),
        ]]);
    }

    private function presentWithdrawal(BankWithdrawal $w): array
    {
        return [
            'id'              => $w->id,
            'amount'          => $w->amount,
            'withdrawal_date' => $w->withdrawal_date->format('Y-m-d'),
            'reason'          => $w->reason,
        ];
    }
}
