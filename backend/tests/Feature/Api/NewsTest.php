<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

it('admin can create a news article', function () {
    Sanctum::actingAs(User::factory()->admin()->create());

    $this->postJson('/api/v1/news', [
        'title' => 'Store Holiday Hours',
        'body'  => 'We will be closed on Saturday.',
        'is_published' => true,
    ])
        ->assertCreated()
        ->assertJsonPath('data.title', 'Store Holiday Hours')
        ->assertJsonPath('data.is_published', true);
});

it('seller can list only published news', function () {
    $admin = User::factory()->admin()->create();
    DB::table('news')->insert([
        ['title' => 'Published Post',   'body' => 'x', 'created_by' => $admin->id, 'is_published' => true,  'published_at' => now(), 'created_at' => now(), 'updated_at' => now()],
        ['title' => 'Unpublished Post', 'body' => 'y', 'created_by' => $admin->id, 'is_published' => false, 'published_at' => null,  'created_at' => now(), 'updated_at' => now()],
    ]);
    Sanctum::actingAs(User::factory()->seller()->create());

    $response = $this->getJson('/api/v1/news')->assertOk();
    $titles = collect($response->json('data'))->pluck('title');
    expect($titles)->toContain('Published Post')
        ->not->toContain('Unpublished Post');
});

it('admin can list all news including unpublished', function () {
    $admin = User::factory()->admin()->create();
    DB::table('news')->insert([
        ['title' => 'AdminVisible', 'body' => 'z', 'created_by' => $admin->id, 'is_published' => false, 'published_at' => null, 'created_at' => now(), 'updated_at' => now()],
    ]);
    Sanctum::actingAs($admin);

    $titles = collect($this->getJson('/api/v1/news')->assertOk()->json('data'))->pluck('title');
    expect($titles)->toContain('AdminVisible');
});

it('admin can update a news article', function () {
    $admin = User::factory()->admin()->create();
    $newsId = DB::table('news')->insertGetId(['title' => 'Old', 'body' => 'x', 'created_by' => $admin->id, 'is_published' => false, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs($admin);

    $this->putJson("/api/v1/news/{$newsId}", ['title' => 'Updated', 'body' => 'x'])
        ->assertOk()
        ->assertJsonPath('data.title', 'Updated');
});

it('seller cannot create news', function () {
    Sanctum::actingAs(User::factory()->seller()->create());
    $this->postJson('/api/v1/news', ['title' => 'X', 'body' => 'Y', 'is_published' => true])
        ->assertForbidden();
});

it('admin can delete a news article', function () {
    $admin = User::factory()->admin()->create();
    $newsId = DB::table('news')->insertGetId(['title' => 'ToDelete', 'body' => 'x', 'created_by' => $admin->id, 'is_published' => true, 'created_at' => now(), 'updated_at' => now()]);
    Sanctum::actingAs($admin);

    $this->deleteJson("/api/v1/news/{$newsId}")->assertOk();
    expect(DB::table('news')->find($newsId))->toBeNull();
});
