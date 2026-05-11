import numpy as np
from tensorflow.keras import regularizers
from tensorflow.keras.layers import Attention, BatchNormalization, Bidirectional, Dense, Dropout, Input, LSTM
from tensorflow.keras.models import Model


def create_emotion_model(input_shape=(716, 768), num_classes=8, compile_model: bool = True) -> Model:
    inputs = Input(shape=input_shape, name="input_features")

    x = Bidirectional(
        LSTM(64, return_sequences=True, kernel_regularizer=regularizers.l2(0.005)),
        name="bi_lstm_1",
    )(inputs)
    x = BatchNormalization(name="batch_norm_1")(x)
    x = Dropout(0.5, name="dropout_1")(x)

    x = Attention(name="self_attention_layer")([x, x])

    x = Bidirectional(
        LSTM(32, kernel_regularizer=regularizers.l2(0.005)),
        name="bi_lstm_2",
    )(x)
    x = BatchNormalization(name="batch_norm_2")(x)
    x = Dropout(0.6, name="dropout_2")(x)

    outputs = Dense(
        num_classes,
        activation="softmax",
        kernel_regularizer=regularizers.l2(0.01),
        name="output_dense",
    )(x)

    model = Model(inputs=inputs, outputs=outputs, name="LSTM_Attention_Model")
    if compile_model:
        model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
    return model


def pad_or_trim_features(features: np.ndarray, target_length: int) -> np.ndarray:
    if features.ndim == 1:
        features = np.expand_dims(features, axis=0)

    current = features.shape[0]
    if current < target_length:
        return np.pad(features, ((0, target_length - current), (0, 0)), mode="constant")
    if current > target_length:
        return features[:target_length, :]
    return features
