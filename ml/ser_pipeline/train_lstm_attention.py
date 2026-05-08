import h5py
import numpy as np
from keras import callbacks, optimizers, regularizers
from keras.layers import Attention, BatchNormalization, Bidirectional, Dense, Dropout, Input, LSTM
from keras.models import Model
from tensorflow.keras.utils import Sequence, to_categorical

from .config import SERConfig


class HDF5DataGenerator(Sequence):
    def __init__(self, h5_file_path, indices, labels_map, batch_size, shuffle=True):
        self.h5_file_path = h5_file_path
        self.indices = indices
        self.labels_map = labels_map
        self.batch_size = batch_size
        self.shuffle = shuffle
        self.hf = h5py.File(self.h5_file_path, "r")
        self.x_ds = self.hf["X_wav2vec2_features"]
        self.y_ds = self.hf["Y_labels"]
        self.num_classes = len(self.labels_map)
        self.on_epoch_end()

    def __len__(self):
        return int(np.floor(len(self.indices) / self.batch_size))

    def __getitem__(self, index):
        batch_idx = self.indices[index * self.batch_size : (index + 1) * self.batch_size]
        batch_idx = np.sort(batch_idx)
        x = self.x_ds[batch_idx]
        y_raw = self.y_ds[batch_idx]
        y = to_categorical(y_raw, num_classes=self.num_classes)
        return x, y

    def on_epoch_end(self):
        if self.shuffle:
            np.random.shuffle(self.indices)

    def close(self):
        self.hf.close()


def _build_model(input_timesteps: int, input_features: int, num_classes: int) -> Model:
    inp = Input(shape=(input_timesteps, input_features), name="input_features")

    x = Bidirectional(LSTM(64, return_sequences=True, kernel_regularizer=regularizers.l2(0.005)), name="bi_lstm_1")(inp)
    x = BatchNormalization(name="batch_norm_1")(x)
    x = Dropout(0.5, name="dropout_1")(x)

    x = Attention(name="self_attention_layer")([x, x])

    x = Bidirectional(LSTM(32, kernel_regularizer=regularizers.l2(0.005)), name="bi_lstm_2")(x)
    x = BatchNormalization(name="batch_norm_2")(x)
    x = Dropout(0.6, name="dropout_2")(x)

    out = Dense(num_classes, activation="softmax", kernel_regularizer=regularizers.l2(0.01), name="output_dense")(x)
    model = Model(inputs=inp, outputs=out, name="LSTM_Attention_Model")
    return model


def train_lstm_attention(config: SERConfig, batch_size: int = 32, epochs: int = 80) -> str:
    train_indices = np.load(config.train_indices_path)
    val_indices = np.load(config.val_indices_path)
    labels_map = np.load(config.labels_mapping_path)

    with h5py.File(config.hdf5_path, "r") as hf:
        input_timesteps, input_features = hf["X_wav2vec2_features"].shape[1:]

    model = _build_model(input_timesteps, input_features, len(labels_map))
    model.compile(
        loss="categorical_crossentropy",
        optimizer=optimizers.Adam(learning_rate=0.0001),
        metrics=["categorical_accuracy"],
    )

    ckpt = callbacks.ModelCheckpoint(
        filepath=str(config.checkpoint_path),
        save_best_only=True,
        monitor="val_categorical_accuracy",
        mode="max",
        save_weights_only=True,
        verbose=1,
    )
    early = callbacks.EarlyStopping(
        monitor="val_categorical_accuracy",
        patience=15,
        mode="max",
        restore_best_weights=True,
        verbose=1,
    )
    lr = callbacks.ReduceLROnPlateau(
        monitor="val_categorical_accuracy",
        factor=0.1,
        patience=10,
        min_lr=0.00001,
        verbose=1,
    )

    train_gen = HDF5DataGenerator(str(config.hdf5_path), train_indices, labels_map, batch_size, shuffle=True)
    val_gen = HDF5DataGenerator(str(config.hdf5_path), val_indices, labels_map, batch_size, shuffle=False)

    try:
        model.fit(train_gen, epochs=epochs, validation_data=val_gen, callbacks=[ckpt, early, lr])
    finally:
        train_gen.close()
        val_gen.close()

    return str(config.checkpoint_path)
