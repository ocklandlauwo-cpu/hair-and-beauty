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
    /** Daily sales per shop with payment-method split and per-channel deposit status. */
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
                SUM(s.total_amount) AS total
            FROM sales s
            JOIN locations l ON l.id = s.location_id
            WHERE s.is_reverted = false
              AND s.sale_date::date BETWEEN ? AND ?
              AND (?::bigint IS NULL OR s.location_id = ?::bigint)
            GROUP BY s.sale_date::date, l.id, l.name
            ORDER BY s.sale_date::date DESC, l.name
        ", [$validated['from'], $validated['to'], $locationId, $locationId]);

        $deposits = BankDeposit::with('verifier:id,name')
            ->whereBetween('deposit_date', [$validated['from'], $validated['to']])
            ->when($locationId, fn ($q) => $q->where('location_id', $locationId))
            ->get()
            ->keyBy(fn ($d) => "{$d->location_id}|{$d->deposit_date->format('Y-m-d')}|{$d->channel}");

        $fmt = fn ($v) => number_format((float) $v, 2, '.', '');

        $depositFor = function ($r, string $channel) use ($deposits, $fmt) {
            $d = $deposits->get("{$r->location_id}|{$r->sale_date}|{$channel}");

            return $d ? [
                'id'               => $d->id,
                'amount'           => $fmt($d->amount),
                'slip_reference'   => $d->slip_reference,
                'verified_at'      => $d->verified_at,
                'verified_by_name' => $d->verifier?->name,
            ] : null;
        };

        return response()->json(['data' => collect($rows)->map(fn ($r) => [
            'sale_date'     => $r->sale_date,
            'location_id'   => (int) $r->location_id,
            'location_name' => $r->location_name,
            'sales_count'   => (int) $r->sales_count,
            'cash'          => $fmt($r->cash),
            'nmb'           => $fmt($r->nmb),
            'mobile'        => $fmt($r->mobile),
            'total'         => $fmt($r->total),
            'deposits'      => [
                'cash'   => $depositFor($r, 'cash'),
                'nmb'    => $depositFor($r, 'nmb'),
                'mobile' => $depositFor($r, 'mobile'),
            ],
        ])->values()]);
    }

    /** Verify that a shop's sales for one channel on a day reached the bank; the amount is snapshotted now. */
    public function storeDeposit(StoreBankDepositRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $exists = BankDeposit::where('location_id', $validated['location_id'])
            ->whereDate('deposit_date', $validated['deposit_date'])
            ->where('channel', $validated['channel'])
            ->exists();
        if ($exists) {
            return response()->json(['message' => 'This deposit has already been verified.'], 422);
        }

        $amount = (float) DB::table('sales')
            ->where('location_id', $validated['location_id'])
            ->whereDate('sale_date', $validated['deposit_date'])
            ->whereIn('payment_method', BankDeposit::CHANNEL_METHODS[$validated['channel']])
            ->where('is_reverted', false)
            ->sum('total_amount');
        if ($amount <= 0) {
            return response()->json(['message' => 'There are no sales to verify for this payment method on this day.'], 422);
        }

        $deposit = BankDeposit::create([
            'location_id'    => $validated['location_id'],
            'deposit_date'   => $validated['deposit_date'],
            'channel'        => $validated['channel'],
            'amount'         => $amount,
            'slip_reference' => $validated['slip_reference'] ?? null,
            'verified_by'    => $request->user()->id,
            'verified_at'    => now(),
        ]);

        return response()->json(['data' => [
            'id'             => $deposit->id,
            'channel'        => $deposit->channel,
            'amount'         => number_format($amount, 2, '.', ''),
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
