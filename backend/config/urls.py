from django.urls import path

from app.api import views


urlpatterns = [
    path("api/health", views.health),
    path("api/bootstrap", views.bootstrap),
    path("api/blockchain/status", views.blockchain_status),
    path("api/firebase/status", views.firebase_status_view),
    path("api/inference/frame", views.inference_frame),
    path("api/alerts", views.alerts),
    path("api/alerts/<str:alert_id>/action", views.alert_action),
    path("api/alerts/<str:alert_id>/anchor", views.anchor_alert),
    path("api/alerts/<str:alert_id>/verification", views.verify_alert),
    path("api/activity", views.activity),
    path("api/guards/<str:guard_id>", views.guard_detail),
    path("api/handover", views.handover),
    path("api/shifts/<str:shift_id>", views.shift_detail),
    path("api/cameras/<str:camera_id>", views.camera_detail),
    path("api/system/action", views.system_action),
    path("api/sync", views.sync),
    path("api/reset", views.reset),
]
